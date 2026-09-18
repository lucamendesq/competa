import { drizzle } from 'drizzle-orm/node-postgres';
import env from '../../config/env.js';
import { getDbUrl } from '../../lib/getDbUrl.js';
import { relations } from './schema/index.js';

export const db = drizzle({
  relations,
  connection: {
    connectionString: getDbUrl({
      user: env.DB_USER,
      password: env.DB_PASS,
      host: env.DB_HOST,
      port: env.DB_PORT,
      dbName: env.DB_NAME,
    }),
    ssl:
      env.NODE_ENV === 'production' ? { ca: env.DB_SSL_CA, rejectUnauthorized: true } : undefined,
  },
});
