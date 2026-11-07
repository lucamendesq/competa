import { Effect } from 'effect';
import env from '../../config/env.js';
import { isAppError, ServiceUnavailable } from '../../lib/app-error.js';
import { Logger } from '../../lib/logger.js';
import { LocalStorage } from './local.storage.js';
import { R2Storage } from './r2.storage.js';
import type { StorageProvider } from './storage.provider.js';

const useR2 = env.NODE_ENV === 'production';

new Logger('Storage').log(
  useR2 ? 'R2Storage (Cloudflare R2)' : `LocalStorage (${env.STORAGE_LOCAL_DIR})`,
);

/** Instância compartilhada de provider de storage: em produção cada `R2Storage` abre o
 *  próprio `S3Client`. */
export const storage: StorageProvider = useR2 ? new R2Storage() : new LocalStorage();

export const openStored = (storageKey: string) =>
  Effect.tryPromise({
    try: () => storage.openRead(storageKey),
    catch: (error) =>
      isAppError(error)
        ? error
        : new ServiceUnavailable(
            'Armazenamento temporariamente inacessível. Tente novamente em instantes.',
          ),
  });
