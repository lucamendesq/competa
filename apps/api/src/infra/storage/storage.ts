import env from '../../config/env.js';
import { Logger } from '../../lib/logger.js';
import { LocalStorage } from './local.storage.js';
import { R2Storage } from './r2.storage.js';
import type { StorageProvider } from './storage.provider.js';

const useR2 = env.NODE_ENV === 'production';

new Logger('Storage').log(
  useR2 ? 'R2Storage (Cloudflare R2)' : `LocalStorage (${env.STORAGE_LOCAL_DIR})`,
);

/** Única instância de provider de storage no processo — o seam que o `StorageModule` era.
 *  Antes a expressão aparecia em três lugares (`storage.module.ts`, `document.repo.ts` e
 *  `zip.routes.ts`) e em produção abria DOIS `S3Client`. */
export const storage: StorageProvider = useR2 ? new R2Storage() : new LocalStorage();
