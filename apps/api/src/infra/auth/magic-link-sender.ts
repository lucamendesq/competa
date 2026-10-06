import { Logger } from '@nestjs/common';
import env from '../../config/env.js';

type MagicLink = { email: string; url: string; token: string };
type Sender = (link: MagicLink) => Promise<void>;

const logger = new Logger('MagicLink');

/** O Better Auth é montado fora da DI do Nest (é biblioteca, não módulo), mas em produção
 *  o email de magic link tem que sair pelo provedor de `modules/messaging` — que é quem
 *  trata falha de canal e registra o envio. Esta é a costura: o MessagingModule injeta o
 *  sender no boot. Sem sender registrado (produção subindo antes do boot terminar), loga e
 *  segue — nunca derruba o login. */
let sender: Sender | undefined;

export const setMagicLinkSender = (fn: Sender) => {
  sender = fn;
};

/** Quem escolhe é o `NODE_ENV`, não se um provedor foi registrado (mesma regra do D15 nos
 *  outros provedores externos): fora de produção o link sempre vai para o terminal, puro e
 *  sem depender do `MessagingModule` já ter inicializado. Em produção, sim, passa pelo
 *  provedor real (Resend) — via o sender que o `MessagingModule` registra, que também
 *  aplica remetente/rodapé e nunca lança. */
export const sendMagicLink = async (link: MagicLink) => {
  if (env.NODE_ENV !== 'production') {
    logger.log(`magic link para ${link.email}: ${link.url}`);
    return;
  }

  if (!sender) {
    // nunca logar a URL em produção: o magic link é credencial (SEC-2)
    logger.warn(`sem provedor de email registrado; link de ${link.email} descartado`);
    return;
  }

  await sender(link);
};

/** Mesma costura do magic link, para o reset de senha do Contador. */
let resetSender: Sender | undefined;

export const setResetPasswordSender = (fn: Sender) => {
  resetSender = fn;
};

export const sendResetPassword = async (link: MagicLink) => {
  if (env.NODE_ENV !== 'production') {
    logger.log(`reset de senha para ${link.email}: ${link.url}`);
    return;
  }

  if (!resetSender) {
    logger.warn(`sem provedor de email registrado; reset de ${link.email} descartado`);
    return;
  }

  await resetSender(link);
};
