import { Injectable } from '@nestjs/common';
import { seconds, ThrottlerGuard } from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Isola o balde do presign por Link de Upload (token), não por IP.
 *  Dois Responsáveis do mesmo NAT não dividem mais a cota — cada link tem a sua.
 *  Fallback para IP quando não há parâmetro `token` (rotas que usem o guard por engano). */
@Injectable()
export class UploadThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const request = req as Request;
    const token = (request.params as Record<string, string>)?.['token'] ?? '';
    return `${request.ip}:${token}`;
  }

  protected override getRequestResponse(context: ExecutionContext): {
    req: Record<string, any>;
    res: Record<string, any>;
  } {
    const http = context.switchToHttp();
    return { req: http.getRequest<Request>(), res: http.getResponse() };
  }

  /** `@Throttle`/`@SkipThrottle` são metadados lidos por QUALQUER guard (inclusive o
   *  `ThrottlerGuard` global por IP), então não dá para "desligar" só o balde global do
   *  `short` (30/10s) sem também desligar este. Por isso este guard ignora os baldes
   *  nomeados do módulo e roda o seu próprio, único e isolado por token. */
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    return this.handleRequest({
      context,
      limit: 60,
      ttl: seconds(60),
      throttler: { name: 'upload-presign', limit: 60, ttl: seconds(60) },
      blockDuration: seconds(60),
      getTracker: this.getTracker.bind(this),
      generateKey: this.generateKey.bind(this),
    });
  }
}
