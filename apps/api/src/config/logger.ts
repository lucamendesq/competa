import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import env from './env.js';

type RequestWithScope = IncomingMessage & {
  firmScope?: string;
  accountantId?: string;
};

const BOOT_CONTEXTS = new Set([
  'InstanceLoader',
  'RoutesResolver',
  'RouterExplorer',
  'NestFactory',
  'NestApplication',
]);

export const pinoOptions: { pinoHttp: Options } = {
  pinoHttp: {
    level: env.LOG_LEVEL,
    autoLogging: {
      ignore: (req) => (req as RequestWithScope).url === '/health',
    },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '[redacted]',
    },
    customProps: (req: IncomingMessage) => {
      const r = req as RequestWithScope;
      return {
        ...(r.firmScope ? { firmId: r.firmScope } : {}),
        ...(r.accountantId ? { accountantId: r.accountantId } : {}),
      };
    },
    customSuccessMessage: (req: IncomingMessage, res: ServerResponse, responseTime: number) =>
      `${req.method} ${req.url} ${res.statusCode} (${responseTime}ms)`,
    customErrorMessage: (req: IncomingMessage, res: ServerResponse) =>
      `${req.method} ${req.url} ${res.statusCode}`,
    genReqId: (req) => req.headers['x-request-id'] ?? crypto.randomUUID(),
    ...(env.NODE_ENV !== 'production' && {
      /* O Nest loga uma linha por módulo e por rota mapeada — ~300 linhas a cada restart do
       * watch. Com logger customizado ele não filtra nível nenhum antes de delegar, então o
       * hook do pino é o único ponto onde dá para cortar. */
      hooks: {
        logMethod(args: unknown[], method: (...a: unknown[]) => void, level: number) {
          const first = args[0] as { context?: string } | undefined;
          if (level <= 30 && first?.context && BOOT_CONTEXTS.has(first.context)) return;
          return method.apply(this, args);
        },
      },
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          singleLine: true,
          messageFormat: '{if context}[{context}] {end}{msg}',
          ignore: 'pid,hostname,context,req,res,responseTime,reqId,firmId,accountantId',
        },
      },
    }),
  },
};
