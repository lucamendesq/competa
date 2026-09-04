import { Logger } from '@nestjs/common';

type MagicLink = { email: string; url: string };
type Sender = (link: MagicLink) => Promise<void>;

const logger = new Logger('MagicLink');

/** O Better Auth é montado fora da DI do Nest (é biblioteca, não módulo), mas o email de
 *  magic link tem que sair pelo provedor de `modules/messaging` — que é quem trata falha
 *  de canal e registra o envio. Esta é a costura: o MessagingModule injeta o sender no
 *  boot. Sem sender registrado, loga e segue (não derruba login em dev). */
let sender: Sender | undefined;

export const setMagicLinkSender = (fn: Sender) => {
  sender = fn;
};

export const sendMagicLink = async (link: MagicLink) => {
  if (!sender) {
    logger.warn(`sem provedor de email registrado; link de ${link.email}: ${link.url}`);
    return;
  }

  await sender(link);
};
