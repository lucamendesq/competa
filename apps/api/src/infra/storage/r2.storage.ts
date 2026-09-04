import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import env from '../../config/env.js';

import { PRESIGN_TTL_SECONDS, StorageProvider, type PresignPutInput } from './storage.provider.js';

@Injectable()
export class R2Storage extends StorageProvider {
  private readonly client = new S3Client({
    region: 'auto',
    // O checksum flexível do SDK v3 vai na URL assinada calculado sobre corpo vazio
    // e o R2 rejeita o PUT do cliente; WHEN_REQUIRED tira o parâmetro da assinatura.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });

  presignPut({ storageKey, contentType }: PresignPutInput) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey, ContentType: contentType }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );
  }
}
