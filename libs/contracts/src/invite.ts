import * as z from 'zod';

export const CreateInviteBody = z.object({ email: z.email() });
export type CreateInviteBody = z.infer<typeof CreateInviteBody>;

export const SignUpBody = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8),
});
export type SignUpBody = z.infer<typeof SignUpBody>;

export const InviteTokenParam = z.object({ token: z.string().min(1) });
export type InviteTokenParam = z.infer<typeof InviteTokenParam>;
