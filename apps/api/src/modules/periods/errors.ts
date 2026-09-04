import { AppError } from '../../lib/app-error.js';

export class PeriodAlreadyOpen extends AppError {
  readonly code = 'PERIOD_ALREADY_OPEN';
  readonly status = 409;

  constructor(referenceMonth: string) {
    super(`A competência ${referenceMonth.slice(0, 7)} já foi aberta nesta Contabilidade.`);
  }
}
