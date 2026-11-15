import { beforeAll, describe, expect, it, vi } from 'vitest';
import { R2Storage } from '../../src/infra/storage/r2.storage.js';

vi.mock('../../src/config/env.js', async (importOriginal) => {
  const { default: env } = await importOriginal<typeof import('../../src/config/env.js')>();
  return {
    default: {
      ...env,
      R2_ACCOUNT_ID: 'account',
      R2_ACCESS_KEY_ID: 'access-key',
      R2_SECRET_ACCESS_KEY: 'secret-key',
      R2_BUCKET: 'bucket',
    },
  };
});

const checksumSha256 = 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=';

describe('R2Storage.presignPut', () => {
  let presigned: URL;

  beforeAll(async () => {
    const storage = new R2Storage();
    presigned = new URL(
      await storage.presignPut({
        storageKey: 'requests/abc/file.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
        checksumSha256,
      }),
    );
  });

  it('assina o checksum como header, para o PUT do navegador com o header bater', () => {
    const signedHeaders = presigned.searchParams.get('X-Amz-SignedHeaders')?.split(';');
    expect(signedHeaders).toContain('x-amz-checksum-sha256');
    expect(signedHeaders).toContain('content-length');
    expect(signedHeaders).toContain('content-type');
  });

  it('não leva o checksum na query string, onde o R2 recusaria o PUT com o header', () => {
    const queryKeys = [...presigned.searchParams.keys()].map((key) => key.toLowerCase());
    expect(queryKeys).not.toContain('x-amz-checksum-sha256');
    expect(presigned.search).not.toContain(encodeURIComponent(checksumSha256));
  });
});
