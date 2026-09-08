import * as z from 'zod';
import { optionalText } from './common.js';

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

/** Aceite do convite: o Responsável define a SENHA aqui. O convite é de uso único, então
 *  sem credencial própria ele ficaria sem porta de entrada depois de aceitá-lo — ao
 *  contrário do Link de Upload, que o fan-out renova todo mês. O email vem do convite:
 *  mandá-lo no corpo só abriria espaço para divergir do que foi convidado. */
export const AcceptContactInviteBody = z.object({
  name: optionalText(),
  password: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.'),
});
export type AcceptContactInviteBody = z.infer<typeof AcceptContactInviteBody>;

/** "Convidar para o app" por Empresa: atalho para o Contador que QUER empurrar a conta,
 *  nunca mecanismo do fluxo (D14, item 8). */
export const SendAccessInvitesBody = z.object({
  companyIds: z.array(z.uuid()).min(1).max(500),
});
export type SendAccessInvitesBody = z.infer<typeof SendAccessInvitesBody>;

/** "Perdi meu link" na home. Resposta e tempo idênticos para email com acesso, email de
 *  Responsável sem acesso e email desconhecido — não revela se a conta existe (D14). */
export const RecoverAccessBody = z.object({ email: z.email() });
export type RecoverAccessBody = z.infer<typeof RecoverAccessBody>;
