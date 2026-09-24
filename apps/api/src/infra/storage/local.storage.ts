import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import env from '../../config/env.js';
import { Forbidden, ServiceUnavailable } from '../../lib/app-error.js';
import { PayloadTooLarge } from './errors.js';
import { PRESIGN_TTL_SECONDS, StorageProvider, type PresignPutInput } from './storage.provider.js';

const root = resolve(env.STORAGE_LOCAL_DIR);

const sign = (storageKey: string, expiresAt: number, sizeBytes: number) =>
  createHmac('sha256', env.BETTER_AUTH_SECRET)
    .update(`${storageKey}:${expiresAt}:${sizeBytes}`)
    .digest('hex');

@Injectable()
export class LocalStorage extends StorageProvider {
  async presignPut({ storageKey, sizeBytes }: PresignPutInput) {
    const expiresAt = Math.floor(Date.now() / 1000) + PRESIGN_TTL_SECONDS;
    const url = new URL(
      `http://localhost:${env.PORT}/storage/local/${encodeURIComponent(storageKey)}`,
    );
    url.searchParams.set('expiresAt', String(expiresAt));
    url.searchParams.set('sizeBytes', String(sizeBytes));
    url.searchParams.set('signature', sign(storageKey, expiresAt, sizeBytes));

    return url.toString();
  }

  async statSize(storageKey: string) {
    try {
      return (await stat(this.safePath(storageKey))).size;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return undefined;
      }
      throw new ServiceUnavailable(
        'Armazenamento temporariamente inacessível. Tente novamente em instantes.',
      );
    }
  }

  async readHead(storageKey: string, bytes = 512): Promise<Buffer> {
    const handle = await open(this.safePath(storageKey), 'r');
    try {
      const buffer = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async remove(storageKey: string) {
    await rm(this.safePath(storageKey), { force: true });
  }

  async openRead(storageKey: string) {
    return createReadStream(this.safePath(storageKey));
  }

  async write(input: {
    storageKey: string;
    expiresAt: number;
    sizeBytes: number;
    signature: string;
    body: Readable;
  }) {
    // A assinatura é a única barreira desta rota (não há sessão nem token de link aqui):
    // sem a checagem, qualquer um escreve arquivo no disco da API.
    const expected = Buffer.from(sign(input.storageKey, input.expiresAt, input.sizeBytes));
    const given = Buffer.from(input.signature);
    const signatureMatches = expected.length === given.length && timingSafeEqual(expected, given);

    if (!signatureMatches || input.expiresAt * 1000 < Date.now()) {
      throw new Forbidden('URL de upload inválida ou expirada.');
    }

    const path = this.safePath(input.storageKey);

    await mkdir(dirname(path), { recursive: true });

    // Corta no tamanho assinado: o equivalente local ao ContentLength assinado do R2 —
    // o cliente não sobe mais do que declarou, e o arquivo parcial é removido.
    let written = 0;
    const limit = new Transform({
      transform(chunk, _encoding, next) {
        written += chunk.length;
        if (written > input.sizeBytes) return next(new PayloadTooLarge(input.sizeBytes));
        next(null, chunk);
      },
    });

    try {
      await pipeline(input.body, limit, createWriteStream(path));
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }

    return path;
  }

  /** `storageKey` vem do banco, mas escapar do diretório de storage é a diferença entre
   *  ler um documento e ler /etc/passwd — a checagem fica no ponto único. */
  private safePath(storageKey: string) {
    const path = join(root, storageKey);
    if (!path.startsWith(root + sep)) throw new Forbidden('Caminho de arquivo inválido.');

    return path;
  }
}
