import * as z from 'zod';

export const SetPasswordBody = z.object({
  password: z.string().min(8, 'Use pelo menos 8 caracteres.'),
});
export type SetPasswordBody = z.infer<typeof SetPasswordBody>;

