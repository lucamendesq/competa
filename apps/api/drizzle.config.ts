import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { getDbUrl } from './src/lib/getDbUrl.js';
import env from './src/config/env.js';

export default defineConfig({
  out: './drizzle',
  schema: './src/infra/database/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDbUrl({
      user: env.DB_USER,
      password: env.DB_PASS,
      host: env.DB_HOST,
      port: env.DB_PORT,
      dbName: env.DB_NAME,
    }),
  },
});
