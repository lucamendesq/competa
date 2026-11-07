export type AccessFacts = {
  readonly subscriptionStatus: string | null;
  readonly trialEndsAt: Date | null;
  readonly currentPeriodEnd: Date | null;
};

/** Defaulting Rule (COM-8): firma bloqueada é `OVERDUE`, trial vencido ou cancelada fora do
 *  período. Cancelada segue valendo até o fim do período já pago: ninguém perde o que pagou
 *  por ter cancelado cedo. Sem período (trial cancelado) bloqueia na hora. Sem assinatura não
 *  bloqueia. Quem lê: o guard da escrita no painel e as varreduras de cobrança (D21). */
export const firmBlocked = (facts: AccessFacts, now = new Date()): boolean => {
  const lapsed = (end: Date) => end.getTime() < now.getTime();
  const canceledAndLapsed =
    facts.subscriptionStatus === 'CANCELED' &&
    (facts.currentPeriodEnd === null || lapsed(facts.currentPeriodEnd));
  const trialExpired =
    facts.subscriptionStatus === 'trialing' &&
    facts.trialEndsAt !== null &&
    lapsed(facts.trialEndsAt);

  return facts.subscriptionStatus === 'OVERDUE' || canceledAndLapsed || trialExpired;
};
