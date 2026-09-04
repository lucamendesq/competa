import { createHmac, timingSafeEqual } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import env from '../../config/env.js';
import { Forbidden } from '../../lib/app-error.js';
import { PRESIGN_TTL_SECONDS, StorageProvider, type PresignPutInput } from './storage.provider.js';

const root = resolve(env.STORAGE_LOCAL_DIR);

const sign = (storageKey: string, expiresAt: number) =>
  createHmac('sha256', env.BETTER_AUTH_SECRET).update(`${storageKey}:${expiresAt}`).digest('hex');

@Injectable()
export class LocalStorage extends StorageProvider {
  async presignPut({ storageKey }: PresignPutInput) {
    const expiresAt = Math.floor(Date.now() / 1000) + PRESIGN_TTL_SECONDS;
    const url = new URL(
      `http://localhost:${env.PORT}/storage/local/${encodeURIComponent(storageKey)}`,
    );
    url.searchParams.set('expiresAt', String(expiresAt));
    url.searchParams.set('signature', sign(storageKey, expiresAt));

    return url.toString();
  }

  async write(input: { storageKey: string; expiresAt: number; signature: string; body: Readable }) {
    // A assinatura é a única barreira desta rota (não há sessão nem token de link aqui):
    // sem a checagem, qualquer um escreve arquivo no disco da API.
    const expected = Buffer.from(sign(input.storageKey, input.expiresAt));
    const given = Buffer.from(input.signature);
    const signatureMatches =
      expected.length === given.length && timingSafeEqual(expected, given);

    if (!signatureMatches || input.expiresAt * 1000 < Date.now()) {
      throw new Forbidden('URL de upload inválida ou expirada.');
    }

    const path = join(root, input.storageKey);
    if (!path.startsWith(root + sep)) throw new Forbidden('URL de upload inválida ou expirada.');

    await mkdir(dirname(path), { recursive: true });
    await pipeline(input.body, createWriteStream(path));

    return path;
  }
}
