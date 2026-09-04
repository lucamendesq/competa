import { differenceInCalendarDays } from 'date-fns';

/** Cadência (docs/domain.md, risco 2): máx. 2 lembretes por Solicitação, com prazo
 *  a partir de D-3 (dá D-3 e D-0 com o intervalo mínimo), sem prazo semanal. */
export const MAX_REMINDERS_PER_REQUEST = 2;
export const DUE_SOON_DAYS = 3;
export const MIN_GAP_DAYS_WITH_DUE_DATE = 3;
export const GAP_DAYS_WITHOUT_DUE_DATE = 7;

export type ReminderCandidate = {
  requestId: string;
  pendingItems: { name: string; dueDate: string | null }[];
  /** prazo geral da Competência — fallback dos itens sem prazo próprio */
  periodDueDate: string | null;
  reminderCount: number;
  /** `created_at` da última `message` da Solicitação (qualquer purpose) */
  lastMessageAt: Date | null;
};

/** Prazo efetivo da Solicitação: o mais próximo entre os itens pendentes. */
export const nextDueDate = (candidate: ReminderCandidate): string | null => {
  const dates = candidate.pendingItems
    .map((item) => item.dueDate ?? candidate.periodDueDate)
    .filter((date): date is string => Boolean(date));

  return dates.length ? dates.sort()[0] : null;
};

export const shouldRemind = (candidate: ReminderCandidate, now: Date): boolean => {
  if (!candidate.pendingItems.length) return false;
  if (candidate.reminderCount >= MAX_REMINDERS_PER_REQUEST) return false;

  const dueDate = nextDueDate(candidate);
  const gapDays = dueDate ? MIN_GAP_DAYS_WITH_DUE_DATE : GAP_DAYS_WITHOUT_DUE_DATE;

  if (candidate.lastMessageAt && differenceInCalendarDays(now, candidate.lastMessageAt) < gapDays) {
    return false;
  }

  if (!dueDate) return true;

  return differenceInCalendarDays(new Date(`${dueDate}T00:00:00`), now) <= DUE_SOON_DAYS;
};

export const pickReminders = <T extends ReminderCandidate>(candidates: T[], now: Date) =>
  candidates.filter((candidate) => shouldRemind(candidate, now));
