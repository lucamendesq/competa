import type { OpenPeriodBody } from '@competa/contracts';
import { run } from '../../effect/runtime.js';
import type { ContactScope, FirmScope } from '../auth/scope.js';
import { PeriodsRepo } from './period.repo.js';
import type { RequestPlan } from './fan-out.js';

/** Casca Nest sobre o serviço Effect (`period.repo.ts`): mantém a DI dos controllers e do
 *  ContactsModule até cada consumidor migrar; morre na fase final. */
export class PeriodRepository {
  openPeriod(scope: FirmScope, body: OpenPeriodBody) {
    return run(PeriodsRepo.use((repo) => repo.openPeriod(scope, body)));
  }

  activeCompanies(scope: FirmScope) {
    return run(PeriodsRepo.use((repo) => repo.activeCompanies(scope)));
  }

  openWithFanOut(
    scope: FirmScope,
    input: { referenceMonth: string; dueDate?: string },
    plans: RequestPlan[],
  ) {
    return run(PeriodsRepo.use((repo) => repo.openWithFanOut(scope, input, plans)));
  }

  list(scope: FirmScope, query: { page: number; perPage: number }) {
    return run(PeriodsRepo.use((repo) => repo.list(scope, query)));
  }

  findOwnedId(scope: FirmScope, periodId: string) {
    return run(PeriodsRepo.use((repo) => repo.findOwnedId(scope, periodId)));
  }

  findById(scope: FirmScope, periodId: string) {
    return run(PeriodsRepo.use((repo) => repo.findById(scope, periodId)));
  }

  pendingPanel(scope: FirmScope, periodId: string) {
    return run(PeriodsRepo.use((repo) => repo.pendingPanel(scope, periodId)));
  }

  closePeriod(scope: FirmScope, periodId: string) {
    return run(PeriodsRepo.use((repo) => repo.closePeriod(scope, periodId)));
  }

  listRequests(scope: FirmScope, periodId: string, query?: { page: number; perPage: number }) {
    return run(PeriodsRepo.use((repo) => repo.listRequests(scope, periodId, query)));
  }

  periods(scope: ContactScope, query: { page: number; perPage: number }) {
    return run(PeriodsRepo.use((repo) => repo.periods(scope, query)));
  }

  periodDetail(scope: ContactScope, periodId: string, companyId?: string) {
    return run(PeriodsRepo.use((repo) => repo.periodDetail(scope, periodId, companyId)));
  }
}
