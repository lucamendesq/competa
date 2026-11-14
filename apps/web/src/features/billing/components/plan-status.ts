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

export const longDate = (iso: string | null | undefined, timeZone?: string) =>
  iso
    ? new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone,
      }).format(new Date(iso))
    : null;

export const accessWindowOf = (
  status: string | undefined,
  currentPeriodEnd: string | null | undefined,
  now = new Date(),
) => {
  const date = longDate(currentPeriodEnd, 'UTC');
  if (status === 'ACTIVE') return date ? { label: 'Período pago até', value: date } : null;
  if (status !== 'CANCELED' && status !== 'OVERDUE') return null;

  const ended = !currentPeriodEnd || new Date(currentPeriodEnd) <= now;
  if (ended) return { label: 'Acesso', value: date ? `Encerrado em ${date}` : 'Encerrado' };
  if (status === 'CANCELED') return { label: 'Acesso até', value: date! };
  return null;
};
