import { addMonths, format, getDaysInMonth, isWeekend, parseISO, setDate, subDays } from 'date-fns';

/** Vencimento que cai em sábado ou domingo é antecipado para a sexta — a regra das
 *  obrigações acessórias. Sem isto o cron de prazo disparava `DeadlineMissed` na segunda
 *  para um item cujo prazo real não tinha vencido, mandando email ao Responsável e a todos
 *  os contadores da firma.
 *  ponytail: só fim de semana. Feriado nacional/municipal exige calendário — ligar um
 *  provedor de feriados aqui quando o ruído justificar. */
const toBusinessDay = (date: Date) => {
  let adjusted = date;
  while (isWeekend(adjusted)) adjusted = subDays(adjusted, 1);

  return adjusted;
};

export const itemDueDate = (
  referenceMonth: string,
  dueDay: number | null,
  dueMonthOffset: number | null,
): string | null => {
  if (dueDay === null) return null;

  /* `?? 1` e não `?? 0`: 1 é o default da coluna e o que o merge do checklist efetivo já
   * aplica. O 0 antigo adiantava o vencimento em um mês inteiro para qualquer chamador que
   * passasse null. */
  const month = addMonths(parseISO(referenceMonth), dueMonthOffset ?? 1);
  const day = setDate(month, Math.min(dueDay, getDaysInMonth(month)));

  return format(toBusinessDay(day), 'yyyy-MM-dd');
};
