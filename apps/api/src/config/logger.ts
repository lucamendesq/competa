import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import env from './env.js';

type RequestWithScope = IncomingMessage & {
  firmScope?: string;
  accountantId?: string;
};

export const pinoOptions: { pinoHttp: Options } = {
  pinoHttp: {
    level: env.LOG_LEVEL,
    autoLogging: {
      ignore: (req) => (req as RequestWithScope).url === '/health',
    },
    /* Os headers de webhook SÃO o segredo: o pino-http serializa todos os headers da
     * requisição, e sem isto o token do Asaas e a assinatura da Meta iam para o log. */
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["asaas-access-token"]',
        'req.headers["x-hub-signature-256"]',
      ],
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
