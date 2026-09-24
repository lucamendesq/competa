import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import env from '../../config/env.js';
import { getDbUrl } from '../../lib/getDbUrl.js';
import { relations } from './schema/index.js';

export const pool = new Pool({
  connectionString: getDbUrl({
    user: env.DB_USER,
    password: env.DB_PASS,
    host: env.DB_HOST,
    port: env.DB_PORT,
    dbName: env.DB_NAME,
  }),
  max: 25,
  min: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  ssl: env.NODE_ENV === 'production' ? { ca: env.DB_SSL_CA, rejectUnauthorized: true } : undefined,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});

export const db = drizzle({ client: pool, relations });
