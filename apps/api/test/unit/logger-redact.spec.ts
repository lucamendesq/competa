import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { maskPathTokens, pinoOptions } from '../../src/config/logger.js';

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

describe('token na URL do log de requisição', () => {
  const token = 'k'.repeat(43);

  it('mascara o token de /upload e de /invites e preserva o resto do caminho', () => {
    expect(maskPathTokens(`/upload/${token}/documents/confirm`)).toBe(
      '/upload/[token]/documents/confirm',
    );
    expect(maskPathTokens(`/upload/${token}?x=1`)).toBe('/upload/[token]?x=1');
    expect(maskPathTokens(`/invites/${token}/contact-account`)).toBe(
      '/invites/[token]/contact-account',
    );
    expect(maskPathTokens('/companies/abc')).toBe('/companies/abc');
  });

  it('nem o serializer de req nem as mensagens levam o token', () => {
    const { serializers, customSuccessMessage, customErrorMessage } = pinoOptions.pinoHttp;
    const req = { method: 'POST', url: `/upload/${token}/documents` };
    const res = { statusCode: 201 };

    const written = [
      JSON.stringify(serializers!.req!(req)),
      customSuccessMessage!(req as never, res as never, 3),
      customErrorMessage!(req as never, res as never, new Error()),
    ].join('\n');

    expect(written).not.toContain(token);
    expect(written).toContain('/upload/[token]/documents');
  });
});
