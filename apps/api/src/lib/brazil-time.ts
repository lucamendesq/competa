const BRAZIL_TIMEZONE = 'America/Sao_Paulo';

/** Dia-calendário no Brasil pro instante dado (`YYYY-MM-DD`). O container roda em UTC —
 *  sem isto, "hoje" vira amanhã entre 21h e meia-noite no horário de Brasília, e prazo
 *  do dia vira "estourado" três horas cedo demais. */
export const brazilDay = (instant: Date | string | number = new Date()): string => {
  const date = instant instanceof Date ? instant : new Date(instant);
  return new Intl.DateTimeFormat('en-CA', { timeZone: BRAZIL_TIMEZONE }).format(date);
};
