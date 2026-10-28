import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { pinoOptions } from '../../src/config/logger.js';

/* O pino-http serializa `req.headers` inteiro na linha de requisição. Os headers de webhook
 * SÃO o segredo — vazá-los no log equivale a publicar o token. */
describe('redação de headers no log de requisição', () => {
  it('token do Asaas e assinatura da Meta saem como [redacted]; o resto fica', () => {
    const lines: string[] = [];
    const logger = pino(
      { redact: pinoOptions.pinoHttp.redact },
      { write: (line: string) => void lines.push(line) },
    );

    logger.info({
      req: {
        headers: {
          'asaas-access-token': 'segredo-asaas',
          'x-hub-signature-256': 'sha256=segredo-meta',
          authorization: 'Bearer segredo-auth',
          cookie: 'session=segredo-cookie',
          'user-agent': 'Asaas-Webhook/1.0',
        },
      },
    });

    const written = lines.join('\n');
    for (const secret of ['segredo-asaas', 'segredo-meta', 'segredo-auth', 'segredo-cookie']) {
      expect(written, secret).not.toContain(secret);
    }
    expect(written).toContain('[redacted]');
    expect(written).toContain('Asaas-Webhook/1.0');
  });
});
