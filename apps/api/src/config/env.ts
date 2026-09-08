import 'dotenv/config';
import * as z from 'zod';

const blankAsMissing = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const REQUIRED_IN_PRODUCTION = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'RESEND_API_KEY',
  'EMAIL_FROM',
] as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.string().optional().transform(Number).default(3000),
    DB_HOST: z.string({ error: 'DB_HOST is required' }),
    DB_PORT: z.string({ error: 'DB_PORT is required' }).transform(Number),
    DB_USER: z.string({ error: 'DB_USER is required' }),
    DB_PASS: z.string({ error: 'DB_PASS is required' }).optional(),
    DB_NAME: z.string({ error: 'DB_NAME is required' }),
    BETTER_AUTH_SECRET: z.string({ error: 'BETTER_AUTH_SECRET is required' }),
    BETTER_AUTH_URL: z.string({ error: 'BETTER_AUTH_URL is required' }),
    WEB_URL: z.url({ error: 'WEB_URL is required' }),
    INVITE_TTL_DAYS: z.string().optional().transform(Number).default(7),
    UPLOAD_LINK_TTL_DAYS: z.string().optional().transform(Number).default(30),
    R2_ACCOUNT_ID: blankAsMissing(z.string()),
    R2_ACCESS_KEY_ID: blankAsMissing(z.string()),
    R2_SECRET_ACCESS_KEY: blankAsMissing(z.string()),
    R2_BUCKET: blankAsMissing(z.string()),
    RESEND_API_KEY: blankAsMissing(z.string()),
    EMAIL_FROM: blankAsMissing(z.string()),
    VAPID_PUBLIC_KEY: blankAsMissing(z.string()),
    VAPID_PRIVATE_KEY: blankAsMissing(z.string()),
    VAPID_SUBJECT: z.string().optional().default('mailto:contato@example.com'),
    STORAGE_LOCAL_DIR: z.string().optional().default('.storage'),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;

    for (const key of REQUIRED_IN_PRODUCTION) {
      if (value[key]) continue;

      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} is required in production (development uses the local stand-in)`,
      });
    }
  });

type Env = z.infer<typeof envSchema>;

const { error, data: env } = envSchema.safeParse(process.env);

if (error || !env) {
  throw new Error(error.issues.reduce((acc, cur) => `${acc}\n${cur.message}`, ''));
}

export default env as Env;
