import { addMonths, format, getDaysInMonth, parseISO, setDate } from 'date-fns';

/** Prazo do Item congelado na abertura: mês de referência + `dueMonthOffset` meses, no
 *  `dueDay`. Sem `dueDay` o Item herda `period.due_date`. Dia além do fim do mês (31 em
 *  fevereiro) clampa para o último dia — Postgres rejeitaria a data. */
export const itemDueDate = (
  referenceMonth: string,
  dueDay: number | null,
  dueMonthOffset: number | null,
): string | null => {
  if (dueDay === null) return null;

  const month = addMonths(parseISO(referenceMonth), dueMonthOffset ?? 0);

  return format(setDate(month, Math.min(dueDay, getDaysInMonth(month))), 'yyyy-MM-dd');
};
