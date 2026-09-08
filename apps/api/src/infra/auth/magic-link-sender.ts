import { AsyncLocalStorage } from 'node:async_hooks';
import { Logger } from '@nestjs/common';

type MagicLink = { email: string; url: string; token: string };
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

/** Contexto assíncrono, não variável de módulo: dois "ativar acesso" simultâneos rodam na
 *  mesma instância, e um flag global entregaria o token de um ao outro — sessão da pessoa
 *  errada. O `AsyncLocalStorage` isola por cadeia de chamada. */
const interception = new AsyncLocalStorage<{ link?: MagicLink }>();

/** Gera o magic link SEM enviá-lo: a ativação de acesso pelo Link de Upload cria a sessão
 *  na mesma requisição (D14 — um toque, nenhum segundo email). */
export const withoutSendingMagicLink = async (run: () => Promise<unknown>) => {
  const intercepted: { link?: MagicLink } = {};
  await interception.run(intercepted, run);

  return intercepted.link;
};

export const sendMagicLink = async (link: MagicLink) => {
  const intercepted = interception.getStore();
  if (intercepted) {
    intercepted.link = link;
    return;
  }

  if (!sender) {
    logger.warn(`sem provedor de email registrado; link de ${link.email}: ${link.url}`);
    return;
  }

  await sender(link);
};
