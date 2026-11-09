import type { AccountantSession } from '@/shared/session';

type Subscription = NonNullable<AccountantSession['accountingFirm']['subscription']>;

export const statusLabelOf = (subscription: Subscription | undefined, now = new Date()) => {
  if (!subscription) return 'Desconhecido';
  const { status, trialEndsAt } = subscription;
  if (status === 'ACTIVE') return 'Ativa';
  if (status === 'OVERDUE') return 'Atrasada';
  if (status === 'CANCELED') return 'Cancelada';
  if (status === 'trialing') {
    return trialEndsAt && new Date(trialEndsAt) < now ? 'Trial Expirado' : 'Trial';
  }
  return status;
};

export const longDate = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(
        new Date(iso),
      )
    : null;
