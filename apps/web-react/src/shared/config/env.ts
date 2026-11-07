import * as z from 'zod';

const EnvSchema = z.object({
  VITE_API_URL: z.url('VITE_API_URL precisa ser uma URL (ex.: http://localhost:3000).'),
  VITE_AUTH_URL: z.url('VITE_AUTH_URL precisa ser uma URL (ex.: http://localhost:3000/api/auth).'),
});

const parsed = EnvSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const problems = parsed.error.issues.map(
    (issue) => `- ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(`Configuração inválida do apps/web-react:\n${problems.join('\n')}`);
}

export const env = {
  apiUrl: parsed.data.VITE_API_URL,
  authUrl: parsed.data.VITE_AUTH_URL,
};
