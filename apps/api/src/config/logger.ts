import type { IncomingMessage } from 'node:http';
import type { Params } from 'nestjs-pino';
import env from './env.js';

type RequestWithScope = IncomingMessage & {
  firmScope?: string;
  accountantId?: string;
};

export const pinoOptions: Params = {
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
    genReqId: (req) => req.headers['x-request-id'] ?? crypto.randomUUID(),
    ...(env.NODE_ENV !== 'production' && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      },
    }),
  },
};
