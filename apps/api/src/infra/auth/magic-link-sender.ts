import { AsyncLocalStorage } from 'node:async_hooks';
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

/** Quem escolhe é o `NODE_ENV`, não se um provedor foi registrado (mesma regra do D15 nos
 *  outros provedores externos): fora de produção o link sempre vai para o terminal, puro e
 *  sem depender do `MessagingModule` já ter inicializado. Em produção, sim, passa pelo
 *  provedor real (Resend) — via o sender que o `MessagingModule` registra, que também
 *  aplica remetente/rodapé e nunca lança. */
export const sendMagicLink = async (link: MagicLink) => {
  const intercepted = interception.getStore();
  if (intercepted) {
    intercepted.link = link;
    return;
  }

  if (env.NODE_ENV !== 'production') {
    logger.log(`magic link para ${link.email}: ${link.url}`);
    return;
  }

  if (!sender) {
    logger.warn(`sem provedor de email registrado; link de ${link.email}: ${link.url}`);
    return;
  }

  await sender(link);
};
