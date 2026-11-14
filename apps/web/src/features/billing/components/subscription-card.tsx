import { useState } from 'react';
import { PAID_PLAN_NAMES, PLANS, type PaidPlanName, type PlanName } from '@competa/contracts';
import { AlertTriangle, CheckCircle2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import type { BillingSubscription, PlanUsage } from '@/features/billing/api/billing.types';
import { isAsaasPaymentUrl, PAYMENT_LINK_REFUSED } from '@/features/billing/api/payment-url';
import { accessWindowOf, longDate, statusLabelOf } from '@/features/billing/components/plan-status';
import { useCancelSubscription, useCheckout } from '@/features/billing/queries/use-billing';
import { Modal } from '@/shared/components/modal';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { apiErrorMessage } from '@/shared/lib/api-error';
import { cn } from '@/shared/lib/cn';
import { useSession } from '@/shared/session';

type SubscriptionCardProps = {
  billing: BillingSubscription | undefined;
  usage: PlanUsage | undefined;
  simulatedCheckout: boolean;
};

export function SubscriptionCard({ billing, usage, simulatedCheckout }: SubscriptionCardProps) {
  const session = useSession();
  const subscription = session.accountant?.accountingFirm.subscription;
  const cancel = useCancelSubscription();
  const keepPlan = useCheckout();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const currentPlan = PLANS[(subscription?.planName ?? 'trial') as PlanName] ?? PLANS.trial;
  const status = subscription?.status;
  const trialEnds = longDate(subscription?.trialEndsAt);
  const accessWindow = accessWindowOf(status, billing?.currentPeriodEnd);
  const invoiceUrl = billing?.invoiceUrl ?? null;
  const pendingPlan = billing?.pendingPlanName
    ? (PLANS[billing.pendingPlanName as PlanName]?.label ?? billing.pendingPlanName)
    : null;
  const scheduledPlan = billing?.scheduledPlanName
    ? (PLANS[billing.scheduledPlanName as PlanName]?.label ?? billing.scheduledPlanName)
    : null;
  const scheduledDate = longDate(billing?.scheduledAt, 'UTC');
  const keepablePlan = PAID_PLAN_NAMES.find((name) => name === billing?.planName);
  const canCancel = session.isOwner && (status === 'ACTIVE' || status === 'OVERDUE');

  const cancelPlan = () => {
    setConfirmCancel(false);
    return cancel
      .mutateAsync()
      .then(() => toast.success('Assinatura cancelada.'))
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível cancelar a assinatura.')),
      );
  };

  const keepCurrentPlan = (planName: PaidPlanName, cycle: BillingSubscription['cycle']) =>
    keepPlan
      .mutateAsync({ planName, cycle })
      .then(() => toast.success('Troca cancelada: você continua no plano atual.'))
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível cancelar a troca de plano.')),
      );

  return (
    <Card className="border border-border shadow-sm rounded-xl">
      <CardHeader>
        <CardTitle level={2} className="flex items-center gap-2 font-display">
          <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
          Assinatura Atual
        </CardTitle>
        <CardDescription>
          Você está no plano <strong>{currentPlan.label}</strong> — até {currentPlan.companyCap}{' '}
          empresas, contadores ilimitados.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex items-center gap-4 rounded-xl border border-border p-4 bg-muted/30">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">Status</p>
            <div className="flex items-center gap-2 mt-1">
              {status === 'ACTIVE' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              ) : session.isOverdue ? (
                <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              ) : (
                <div
                  className="h-5 w-5 rounded-full bg-sky-600 flex items-center justify-center"
                  aria-hidden="true"
                >
                  <span className="text-white text-xs font-bold">T</span>
                </div>
              )}
              <p
                className={cn(
                  'text-lg font-semibold',
                  session.isOverdue && 'text-destructive',
                  status === 'ACTIVE' && 'text-emerald-700 font-bold',
                )}
              >
                {statusLabelOf(subscription)}
              </p>
            </div>
          </div>
          {status === 'trialing' && trialEnds ? (
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">Encerramento do Trial</p>
              <p className="text-lg font-semibold text-foreground mt-1">{trialEnds}</p>
            </div>
          ) : null}
          {accessWindow ? (
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{accessWindow.label}</p>
              <p className="text-lg font-semibold text-foreground mt-1">{accessWindow.value}</p>
            </div>
          ) : null}
          {usage ? (
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">Empresas ativas</p>
              <p
                className={cn(
                  'text-lg font-semibold mt-1',
                  usage.overCap ? 'text-warning-foreground' : 'text-foreground',
                )}
              >
                {usage.companiesActive} de {usage.companyCap}
              </p>
            </div>
          ) : null}
        </div>

        {simulatedCheckout ? (
          <div className="bg-warning-surface text-warning-foreground border border-warning-border rounded-lg p-4 text-sm font-medium">
            Ambiente sem gateway de pagamento: a assinatura foi registrada apenas no log do servidor
            e <strong>nenhuma cobrança real foi criada</strong>. Em produção este botão leva ao
            checkout do Asaas.
          </div>
        ) : null}

        {session.isOverdue ? (
          <div className="bg-danger-surface border border-danger-border text-danger-foreground rounded-lg p-4 text-sm font-medium">
            Seu acesso de escrita foi temporariamente suspenso devido a pendências na assinatura. As
            empresas ainda conseguem enviar documentos e você pode baixar arquivos já enviados.
          </div>
        ) : null}

        {scheduledPlan ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foreground">
              Seu plano muda para <strong>{scheduledPlan}</strong> (
              {billing?.scheduledCycle === 'yearly' ? 'anual' : 'mensal'})
              {scheduledDate ? (
                <>
                  {' '}
                  em <strong>{scheduledDate}</strong>
                </>
              ) : null}
              . Até lá você segue com os recursos do plano {currentPlan.label}.
            </p>
            {session.isOwner && keepablePlan && billing ? (
              <Button
                variant="outline"
                size="sm"
                disabled={keepPlan.isPending}
                onClick={() => void keepCurrentPlan(keepablePlan, billing.cycle)}
              >
                Manter o plano atual
              </Button>
            ) : null}
          </div>
        ) : null}

        {invoiceUrl ? (
          <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foreground">
              {pendingPlan ? (
                <>
                  Fatura do plano <strong>{pendingPlan}</strong> aguardando pagamento.{' '}
                </>
              ) : (
                'Há uma fatura em aberto na sua assinatura. '
              )}
              Boleto, Pix ou cartão: a escolha é na página da fatura.
            </p>
            {isAsaasPaymentUrl(invoiceUrl) ? (
              <Button asChild>
                <a href={invoiceUrl} target="_blank" rel="noopener noreferrer">
                  Pagar fatura
                </a>
              </Button>
            ) : (
              <p role="alert" className="text-danger text-sm">
                {PAYMENT_LINK_REFUSED}
              </p>
            )}
          </div>
        ) : null}
      </CardContent>

      {canCancel ? (
        <CardFooter className="justify-end">
          <Button
            variant="ghost"
            size="sm"
            disabled={cancel.isPending}
            onClick={() => setConfirmCancel(true)}
          >
            Cancelar assinatura
          </Button>
        </CardFooter>
      ) : null}

      <Modal
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancelar a assinatura?"
        description="O acesso continua até o fim do período já pago; depois disso a escrita é bloqueada e as empresas continuam conseguindo enviar."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={() => void cancelPlan()}>
              Cancelar assinatura
            </Button>
          </>
        }
      />
    </Card>
  );
}
