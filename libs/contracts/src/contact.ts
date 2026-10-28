import * as z from 'zod';
import { newPassword } from './common.js';

export const SetPasswordBody = z.object({
  password: newPassword('Use pelo menos 8 caracteres.'),
});
export type SetPasswordBody = z.infer<typeof SetPasswordBody>;
