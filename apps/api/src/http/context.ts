import { Context } from 'effect';
import type { AuthSession } from '../modules/auth/auth-provider.js';
import type { ContactScope, FirmScope, UploadScope } from '../modules/auth/scope.js';

/* O que os `createParamDecorator` entregavam ao handler (`@CurrentScope`,
 * `@CurrentAccountantId`, `@CurrentPlan`, `@Session`, `@CurrentContactScope`,
 * `@CurrentUploadScope`), agora como serviço de request: quem não recebe o perfil de
 * middleware correspondente nem compila, em vez de tomar 401 em runtime. */

export class FirmContext extends Context.Service<
  FirmContext,
  {
    readonly scope: FirmScope;
    readonly accountantId: string;
    readonly planName: string;
    readonly session: AuthSession;
  }
>()('competa/api/http/FirmContext') {}

export class ContactContext extends Context.Service<
  ContactContext,
  {
    readonly scope: ContactScope;
    readonly session: AuthSession;
  }
>()('competa/api/http/ContactContext') {}

/** O fluxo por link não tem sessão; o upload logado do Responsável tem. */
export class UploadContext extends Context.Service<
  UploadContext,
  {
    readonly scope: UploadScope;
    readonly session?: AuthSession;
  }
>()('competa/api/http/UploadContext') {}

export class SessionContext extends Context.Service<SessionContext, AuthSession>()(
  'competa/api/http/SessionContext',
) {}
