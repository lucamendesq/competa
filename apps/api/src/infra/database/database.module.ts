import { Global, Module } from '@nestjs/common';
import { Database } from './database.js';
import { db } from './index.js';

@Global()
@Module({
  providers: [{ provide: Database, useValue: db }],
  exports: [Database],
})
export class DatabaseModule {}
