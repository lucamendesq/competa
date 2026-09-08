import { addMonths, format, getDaysInMonth, parseISO, setDate } from 'date-fns';

export const itemDueDate = (
  referenceMonth: string,
  dueDay: number | null,
  dueMonthOffset: number | null,
): string | null => {
  if (dueDay === null) return null;

  const month = addMonths(parseISO(referenceMonth), dueMonthOffset ?? 0);

  return format(setDate(month, Math.min(dueDay, getDaysInMonth(month))), 'yyyy-MM-dd');
};
