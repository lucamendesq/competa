import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import env from '../../config/env.js';
import { NotFound, ServiceUnavailable } from '../../lib/app-error.js';

import { PRESIGN_TTL_SECONDS, StorageProvider, type PresignPutInput } from './storage.provider.js';

@Injectable()
export class R2Storage extends StorageProvider {
  private readonly client = new S3Client({
    region: 'auto',
    requestChecksumCalculation: 'WHEN_REQUIRED',
    forcePathStyle: true,
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });

  async openRead(storageKey: string) {
    try {
      const { Body } = await this.client.send(
        new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey }),
      );

      if (!Body) throw new NotFound('Arquivo não encontrado no storage.');

      return Body as Readable;
    } catch (error) {
      if (error instanceof NotFound) throw error;
      if (error instanceof S3ServiceException) {
        if (
          error.$metadata.httpStatusCode === 404 ||
          error.name === 'NotFound' ||
          error.name === 'NoSuchKey'
        ) {
          throw new NotFound('Arquivo não encontrado no storage.');
        }
      }
      throw new ServiceUnavailable(
        'Armazenamento temporariamente inacessível. Tente novamente em instantes.',
      );
    }
  }

  presignPut({ storageKey, contentType, sizeBytes, checksumSha256 }: PresignPutInput) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: storageKey,
        ContentType: contentType,
        ContentLength: sizeBytes,
        ...(checksumSha256 ? { ChecksumSHA256: checksumSha256 } : {}),
      }),
      {
        expiresIn: PRESIGN_TTL_SECONDS,
        signableHeaders: new Set([
          'content-length',
          'content-type',
          ...(checksumSha256 ? ['x-amz-checksum-sha256'] : []),
        ]),
      },
    );
  }

  async statSize(storageKey: string): Promise<number | undefined> {
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const { ContentLength } = await this.client.send(
          new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey }),
        );

        return ContentLength;
      } catch (error) {
        if (error instanceof S3ServiceException) {
          if (
            error.$metadata.httpStatusCode === 404 ||
            error.name === 'NotFound' ||
            error.name === 'NoSuchKey'
          ) {
            return undefined;
          }
        }
        attempt += 1;
        if (attempt >= maxRetries) {
          throw new ServiceUnavailable(
            'Armazenamento temporariamente inacessível. Tente novamente em instantes.',
          );
        }
        const backoffMs = Math.min(200 * Math.pow(2, attempt) + Math.random() * 100, 3000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
    return undefined;
  }

  async readHead(storageKey: string, bytes = 512): Promise<Buffer> {
    try {
      const { Body } = await this.client.send(
        new GetObjectCommand({
          Bucket: env.R2_BUCKET,
          Key: storageKey,
          Range: `bytes=0-${bytes - 1}`,
        }),
      );

      if (!Body) return Buffer.alloc(0);

      const chunks: Buffer[] = [];
      for await (const chunk of Body as Readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch {
      return Buffer.alloc(0);
    }
  }

  async remove(storageKey: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey }));
  }
}
