import { pinoHttp, type HttpLogger } from 'pino-http';
import { pinoOptions } from '../config/logger.js';

/* Uma única instância de pino-http no processo: `requestLogger()` é o middleware de
 * requisição e `.logger` é a raiz. Preguiçosa porque o transporte `pino-pretty` abre
 * uma worker thread, e quem só importa um repositório não deve pagar por ela. */
let instance: HttpLogger | undefined;

export const requestLogger = (): HttpLogger => (instance ??= pinoHttp(pinoOptions.pinoHttp));

type Level = 'info' | 'warn' | 'error';

/** `{ context }` no objeto e a mensagem como segundo argumento do pino: é o que o
 *  `messageFormat` de `config/logger.ts` lê. */
export class Logger {
  constructor(private readonly context: string) {}

  log(message: string, ...rest: unknown[]) {
    this.write('info', message, rest);
  }

  warn(message: string, ...rest: unknown[]) {
    this.write('warn', message, rest);
  }

  error(message: string, ...rest: unknown[]) {
    this.write('error', message, rest);
  }

  private write(level: Level, message: string, rest: unknown[]) {
    requestLogger().logger[level]({ context: this.context }, message, ...rest);
  }
}
