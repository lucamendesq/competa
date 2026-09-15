import 'dotenv/config';
import * as z from 'zod';

const blankAsMissing = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const REQUIRED_IN_PRODUCTION = [
  'DB_SSL_CA',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'SENTRY_DSN',
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
    /* CA da Supabase (PEM). Sem verificação de cadeia o TLS de produção aceita qualquer
     * certificado no caminho (SEC-1). */
    DB_SSL_CA: blankAsMissing(z.string()),
    BETTER_AUTH_SECRET: z.string({ error: 'BETTER_AUTH_SECRET is required' }),
    BETTER_AUTH_URL: z.string({ error: 'BETTER_AUTH_URL is required' }),
    WEB_URL: z.url({ error: 'WEB_URL is required' }),
    TRUSTED_ORIGINS: z
      .string()
      .optional()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim().replace(/\/$/, ''))
          .filter(Boolean),
      ),
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
    SENTRY_DSN: blankAsMissing(z.string()),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .optional()
      .default('info'),
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

/** Origens que o navegador pode usar para falar com a API. Não existe curinga aqui: com
 *  `credentials: true` o navegador recusa `Access-Control-Allow-Origin: *`, então cada
 *  origem precisa voltar ecoada. `TRUSTED_ORIGINS` é a porta para testar de outro
 *  aparelho na rede local (`http://192.168.0.133:4200`) sem trocar a `WEB_URL`, que
 *  continua sendo a que vai dentro de e-mail e Link de Upload. */
export const allowedOrigins = [env.WEB_URL, ...env.TRUSTED_ORIGINS];
