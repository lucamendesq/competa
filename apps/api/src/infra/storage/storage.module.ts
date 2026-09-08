import { Logger, Module } from '@nestjs/common';
import env from '../../config/env.js';
import { LocalStorageController } from './local-storage.controller.js';
import { LocalStorage } from './local.storage.js';
import { R2Storage } from './r2.storage.js';
import { StorageProvider } from './storage.provider.js';

const useR2 = env.NODE_ENV === 'production';

new Logger('StorageModule').log(
  useR2 ? 'R2Storage (Cloudflare R2)' : `LocalStorage (${env.STORAGE_LOCAL_DIR})`,
);

@Module({
  providers: useR2
    ? [{ provide: StorageProvider, useClass: R2Storage }]
    : [LocalStorage, { provide: StorageProvider, useExisting: LocalStorage }],
  controllers: useR2 ? [] : [LocalStorageController],
  exports: [StorageProvider],
})
export class StorageModule {}
