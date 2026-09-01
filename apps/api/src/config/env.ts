import 'dotenv/config';
import * as z from 'zod';

const envSchema = z.object({
  PORT: z.string().optional().transform(Number).default(3000),
  DB_HOST: z.string({ error: 'DB_HOST is required' }),
  DB_PORT: z.string({ error: 'DB_PORT is required' }).transform(Number),
  DB_USER: z.string({ error: 'DB_USER is required' }),
  DB_PASS: z.string({ error: 'DB_PASS is required' }).optional(),
  DB_NAME: z.string({ error: 'DB_NAME is required' }),
  BETTER_AUTH_SECRET: z.string({ error: 'BETTER_AUTH_SECRET is required' }),
  BETTER_AUTH_URL: z.string({ error: 'BETTER_AUTH_URL is required' }),
  WEB_URL: z.url({ error: 'WEB_URL is required' }),
});

type Env = z.infer<typeof envSchema>;

const { error, data: env } = envSchema.safeParse(process.env);

if (error || !env) {
  throw new Error(error.issues.reduce((acc, cur) => `${acc}\n${cur.message}`, ''));
}

export default env as Env;
