import { IdParam, OpenPeriodBody, PaginationQuery } from '@competa/contracts';
import type { EventEmitter2 } from '../../lib/event-emitter.js';
import { Effect, Layer } from 'effect';
import { HttpServerRequest } from 'effect/http';
import env from '../../config/env.js';
import { fromRuntime } from '../../effect/runtime.js';
import { FirmContext } from '../../http/context.js';
import { handler, paginated } from '../../http/envelope.js';
import { firmRoute } from '../../http/middleware/auth.js';
import { body, params, query, route } from '../../http/platform.js';
import { NotFound } from '../../lib/app-error.js';
import { EVENTS, type RequestCreatedEvent } from '../../lib/events.js';
import { PeriodsRepo } from './period.repo.js';

const open = (events: EventEmitter2) =>
  route(
    'POST',
    '/periods',
    handler(
      'POST',
      Effect.gen(function* () {
        const { scope } = yield* FirmContext;
        const input = yield* body(OpenPeriodBody);

        const { period, warnings, plans, requestIdByCompany } = yield* fromRuntime(
          PeriodsRepo.use((repo) => repo.openPeriod(scope, input)),
        );

        const requests = plans.map((plan) => ({
          id: requestIdByCompany.get(plan.companyId)!,
          companyId: plan.companyId,
          companyName: plan.companyName,
          itemCount: plan.items.length,
          /** único momento em que o token existe em claro; a Fase 5 o entrega por email */
          uploadUrl: `${env.WEB_URL}/envio/${plan.token}`,
        }));

        // messaging escuta e entrega o link ao Responsável (Fase 5). Emitido depois da
        // transação: o email não pode sair por uma abertura que deu rollback.
        for (const [index, plan] of plans.entries()) {
          const created: RequestCreatedEvent = {
            requestId: requests[index].id,
            periodId: period.id,
            referenceMonth: period.referenceMonth,
            periodDueDate: period.dueDate,
            companyId: plan.companyId,
            companyName: plan.companyName,
            contactId: plan.contactId,
            contactName: plan.contactName,
            contactEmail: plan.contactEmail,
            contactPhone: plan.contactPhone,
            uploadUrl: requests[index].uploadUrl,
            itemCount: plan.items.length,
          };

          events.emit(EVENTS.RequestCreated, created);
        }

        return { ...period, warnings, requests };
      }),
    ),
    { auth: firmRoute() },
  );

const list = route(
  'GET',
  '/periods',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const page = yield* query(PaginationQuery);

      const { rows, total } = yield* fromRuntime(PeriodsRepo.use((repo) => repo.list(scope, page)));

      return paginated(rows, { page: page.page, perPage: page.perPage, total });
    }),
  ),
  { auth: firmRoute() },
);

const get = route(
  'GET',
  '/periods/:id',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      const row = yield* fromRuntime(PeriodsRepo.use((repo) => repo.findById(scope, id)));
      if (!row) return yield* Effect.fail(new NotFound('Competência não encontrada.'));

      return row;
    }),
  ),
  { auth: firmRoute() },
);

const listRequests = route(
  'GET',
  '/periods/:id/requests',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);
      const rawQuery = yield* HttpServerRequest.ParsedSearchParams;

      const owned = yield* fromRuntime(PeriodsRepo.use((repo) => repo.findOwnedId(scope, id)));
      if (!owned) return yield* Effect.fail(new NotFound('Competência não encontrada.'));

      if (rawQuery['page'] !== undefined || rawQuery['perPage'] !== undefined) {
        /* Bug congelado #1: `parse` CRU, fora do `zodPipe`. O `ZodError` não casa com
         * nenhum ramo do mapa de erros e vira 500 INTERNAL_ERROR em vez de 422. */
        const page = PaginationQuery.parse(rawQuery);
        const result = yield* fromRuntime(
          PeriodsRepo.use((repo) => repo.listRequests(scope, id, page)),
        );
        if ('rows' in result) {
          return paginated(result.rows, {
            page: page.page,
            perPage: page.perPage,
            total: result.total,
          });
        }
      }

      return yield* fromRuntime(PeriodsRepo.use((repo) => repo.listRequests(scope, id)));
    }),
  ),
  { auth: firmRoute() },
);

const pendingPanel = route(
  'GET',
  '/periods/:id/pending-panel',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      const owned = yield* fromRuntime(PeriodsRepo.use((repo) => repo.findOwnedId(scope, id)));
      if (!owned) return yield* Effect.fail(new NotFound('Competência não encontrada.'));

      return yield* fromRuntime(PeriodsRepo.use((repo) => repo.pendingPanel(scope, id)));
    }),
  ),
  { auth: firmRoute() },
);

const close = route(
  'POST',
  '/periods/:id/close',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      const closed = yield* fromRuntime(PeriodsRepo.use((repo) => repo.closePeriod(scope, id)));
      if (!closed) return yield* Effect.fail(new NotFound('Competência não encontrada.'));

      return {
        ...closed,
        warning: closed.pendingItemCount
          ? `Competência encerrada com ${closed.pendingItemCount} item(ns) sem aceite.`
          : null,
      };
    }),
  ),
  { auth: firmRoute() },
);

export const periodsRoutes = (events: EventEmitter2) =>
  Layer.mergeAll(open(events), list, get, listRequests, pendingPanel, close);
