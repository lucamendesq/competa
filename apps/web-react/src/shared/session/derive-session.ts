import type { AccountantSession, ContactSession, Session } from '@/shared/session/session.types';

type Subscription = NonNullable<AccountantSession['accountingFirm']['subscription']>;

export const subscriptionOverdue = (subscription: Subscription | undefined, now = new Date()) => {
  if (!subscription) return false;
  if (subscription.status === 'OVERDUE') return true;
  if (subscription.status === 'CANCELED') {
    return !subscription.currentPeriodEnd || new Date(subscription.currentPeriodEnd) < now;
  }
  return (
    subscription.status === 'trialing' &&
    Boolean(subscription.trialEndsAt) &&
    new Date(subscription.trialEndsAt!) < now
  );
};

export const deriveSession = ({
  status,
  accountant,
  contact,
}: {
  status: Session['status'];
  accountant: AccountantSession | null;
  contact: ContactSession | null;
}): Session => ({
  status,
  accountant,
  contact,
  isOwner: accountant?.accountant.owner ?? false,
  isOverdue: subscriptionOverdue(accountant?.accountingFirm.subscription),
  can: (capability) => accountant?.accountingFirm.plan.capabilities.includes(capability) ?? false,
});
