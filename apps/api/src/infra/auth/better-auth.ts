import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { v7 as uuidv7 } from 'uuid';
import { db } from '../database/index.js';
import * as schema from '../database/auth-schema.js';

export default betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    database: {
      // user.id is a uuid column, better-auth's default id is not a uuid
      generateId: () => uuidv7(),
    },
  },
});
