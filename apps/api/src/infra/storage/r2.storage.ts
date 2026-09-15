import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import env from '../../config/env.js';
import { NotFound } from '../../lib/app-error.js';

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
    const { Body } = await this.client.send(
      new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey }),
    );

    if (!Body) throw new NotFound('Arquivo não encontrado no storage.');

    return Body as Readable;
  }

  presignPut({ storageKey, contentType, sizeBytes }: PresignPutInput) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: storageKey,
        ContentType: contentType,
        ContentLength: sizeBytes,
      }),
      /* content-type assinado (SSRF-1): o PUT só aceita o tipo declarado no presign — o
       * mesmo que foi validado e gravado em `document.content_type`. */
      { expiresIn: PRESIGN_TTL_SECONDS, signableHeaders: new Set(['content-length', 'content-type']) },
    );
  }

  async statSize(storageKey: string) {
    try {
      const { ContentLength } = await this.client.send(
        new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey }),
      );

      return ContentLength;
    } catch {
      return undefined;
    }
  }

  async remove(storageKey: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey }));
  }
}
