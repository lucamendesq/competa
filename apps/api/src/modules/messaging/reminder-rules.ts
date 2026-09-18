import { differenceInCalendarDays, parseISO } from 'date-fns';
import { brazilDay } from '../../lib/brazil-time.js';

/** Cadência (docs/domain.md, risco 2). Os três knobs são por Contabilidade
 *  (`accounting_firm.reminder_*`); os defaults reproduzem o comportamento histórico:
 *  máx. 2 lembretes por Solicitação, com prazo a partir de D-3, gap mínimo de 3 dias. */
export type ReminderSettings = {
  reminderMax: number;
  reminderDueSoonDays: number;
  reminderGapDays: number;
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  reminderMax: 2,
  reminderDueSoonDays: 3,
  reminderGapDays: 3,
};

/** Sem prazo o gap é semanal e fixo: caso raro, não paga um 4º knob. */
export const GAP_DAYS_WITHOUT_DUE_DATE = 7;

export type ReminderCandidate = {
  requestId: string;
  accountingFirmId: string;
  pendingItems: { name: string; dueDate: string | null }[];
  periodDueDate: string | null;
  reminderCount: number;
  lastMessageAt: Date | null;
};

export const nextDueDate = (
  candidate: Pick<ReminderCandidate, 'pendingItems' | 'periodDueDate'>,
): string | null => {
  const dates = candidate.pendingItems
    .map((item) => item.dueDate ?? candidate.periodDueDate)
    .filter((date): date is string => Boolean(date));

  return dates.length ? dates.sort()[0] : null;
};

export const shouldRemind = (
  candidate: Omit<ReminderCandidate, 'accountingFirmId' | 'requestId'>,
  now: Date,
  settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS,
): boolean => {
  if (!candidate.pendingItems.length) return false;
  if (candidate.reminderCount >= settings.reminderMax) return false;

  const dueDate = nextDueDate(candidate);
  const gapDays = dueDate ? settings.reminderGapDays : GAP_DAYS_WITHOUT_DUE_DATE;
  /* Diferença em dias-calendário do Brasil, não do relógio do container (UTC): sem
   * isto, o gap e o "quase vencendo" adiantam ou atrasam 1 dia perto da virada. */
  const today = parseISO(brazilDay(now));

  if (
    candidate.lastMessageAt &&
    differenceInCalendarDays(today, parseISO(brazilDay(candidate.lastMessageAt))) < gapDays
  ) {
    return false;
  }

  if (!dueDate) return true;

  return differenceInCalendarDays(parseISO(dueDate), today) <= settings.reminderDueSoonDays;
};

export const pickReminders = <T extends ReminderCandidate>(
  candidates: T[],
  now: Date,
  settingsByFirm?: Map<string, ReminderSettings>,
) =>
  candidates.filter((candidate) =>
    shouldRemind(candidate, now, settingsByFirm?.get(candidate.accountingFirmId)),
  );
