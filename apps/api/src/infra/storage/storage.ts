import env from '../../config/env.js';
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
