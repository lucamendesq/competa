import { useState } from 'react';
import { Cnpj, PAID_PLANS, type BillingCycle, type PaidPlanName } from '@competa/contracts';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { isAsaasPaymentUrl, PAYMENT_LINK_REFUSED } from '@/features/billing/api/payment-url';
import { PlanCard, type PriceOverride } from '@/features/billing/components/plan-card';
import { PlanComparison } from '@/features/billing/components/plan-comparison';
import { SubscriptionCard } from '@/features/billing/components/subscription-card';
import {
  useBillingUsage,
  useCheckout,
  useSubscription,
} from '@/features/billing/queries/use-billing';
import { Callout } from '@/shared/components/callout';
import { PlanCapBanner } from '@/shared/components/plan-cap-banner';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { apiErrorMessage } from '@/shared/lib/api-error';
import { cn } from '@/shared/lib/cn';
import { useSession } from '@/shared/session';

const CYCLES: { value: BillingCycle; param: string }[] = [
  { value: 'monthly', param: 'mensal' },
  { value: 'yearly', param: 'anual' },
];

const goTo = (url: string) => window.location.assign(url);

export function PlanPage() {
  const session = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlighted = searchParams.get('plano') ?? 'profissional';
  const cycle: BillingCycle = searchParams.get('ciclo') === 'anual' ? 'yearly' : 'monthly';
  const billing = useSubscription();
  const usage = useBillingUsage();
  const checkout = useCheckout();
  const [cnpjDraft, setCnpjDraft] = useState('');
  const [cnpjError, setCnpjError] = useState<string | null>(null);
  const [simulatedCheckout, setSimulatedCheckout] = useState(false);

  const firm = session.accountant?.accountingFirm;
  const subscription = firm?.subscription;
  const firmCnpj = firm?.cnpj ?? null;
  const override = (subscription?.priceOverride ?? null) as PriceOverride;
  const isOwner = session.isOwner;

  const setCycle = (next: BillingCycle) =>
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.set('ciclo', next === 'yearly' ? 'anual' : 'mensal');
        return params;
      },
      { replace: true },
    );

  const subscribe = (planName: PaidPlanName) => {
    setCnpjError(null);
    let cnpj: string | undefined;
    if (!firmCnpj) {
      const parsed = Cnpj.safeParse(cnpjDraft);
      if (!parsed.success) {
        setCnpjError(parsed.error.issues[0]?.message ?? 'CNPJ inválido.');
        return;
      }
      cnpj = parsed.data;
    }
    setSimulatedCheckout(false);
    return checkout
      .mutateAsync({ planName, cycle, ...(cnpj ? { cnpj } : {}) })
      .then(({ checkoutUrl, simulated, applied }) => {
        if (applied) {
          toast.success('Plano atualizado. A próxima fatura já sai no valor novo.');
          return;
        }
        if (simulated) {
          setSimulatedCheckout(true);
          toast.info('Pagamento simulado: nenhuma cobrança foi criada neste ambiente.');
          return;
        }
        if (!checkoutUrl) {
          toast.success('Troca registrada: vale a partir da próxima fatura.');
          return;
        }
        if (!isAsaasPaymentUrl(checkoutUrl)) {
          console.error('checkoutUrl recusada: host fora de asaas.com', checkoutUrl);
          toast.error(PAYMENT_LINK_REFUSED);
          return;
        }
        goTo(checkoutUrl);
      })
      .catch((error: unknown) =>
        toast.error(
          apiErrorMessage(error, 'Não foi possível gerar o link de pagamento. Tente novamente.'),
        ),
      );
  };

  return (
    <div className="mx-auto max-w-5xl w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight font-display text-foreground">
          Plano e Assinatura
        </h1>
        <p className="text-muted-foreground mt-2">
          Gerencie o plano da sua Contabilidade e o acesso ao Competa.
        </p>
      </div>

      <PlanCapBanner usage={usage.data} className="mb-6" />

      {isOwner ? null : (
        <Callout tone="info" heading="Somente leitura" className="mb-6">
          Apenas o dono da Contabilidade pode assinar ou trocar de plano.
        </Callout>
      )}

      <SubscriptionCard
        billing={billing.data}
        usage={usage.data}
        simulatedCheckout={simulatedCheckout}
      />

      <div className="mt-8">
        <h2 className="text-xl font-bold font-display text-foreground mb-4">
          {subscription?.status === 'ACTIVE' ? 'Mudar de plano' : 'Escolha o seu plano'}
        </h2>
        <p className="text-muted-foreground mb-6 text-sm">
          O preço é por Contabilidade e a conta é por <strong>empresa ativa cadastrada</strong> —
          nunca por usuário. Todo plano inclui contadores ilimitados.
        </p>

        <div
          className="inline-flex rounded-lg border border-border bg-card p-1"
          role="group"
          aria-label="Ciclo de cobrança"
        >
          {CYCLES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={cycle === option.value}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                cycle === option.value
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setCycle(option.value)}
            >
              {option.value === 'monthly' ? 'Mensal' : 'Anual'}
              {option.value === 'yearly' ? (
                <span className="ml-1 font-semibold">· 2 meses grátis</span>
              ) : null}
            </button>
          ))}
        </div>

        <p className="text-muted-foreground mt-3 text-sm">
          O anual é cobrado de uma vez, em boleto com Pix no QR Code.{' '}
          <strong>Não existe assinatura mensal no Pix</strong> — no mensal o pagamento é no cartão
          ou por boleto avulso.
        </p>

        {firmCnpj ? null : (
          <div className="mt-6 flex max-w-sm flex-col gap-1.5">
            <Label htmlFor="checkoutCnpj">CNPJ da Contabilidade</Label>
            <Input
              id="checkoutCnpj"
              value={cnpjDraft}
              disabled={!isOwner}
              inputMode="numeric"
              placeholder="00.000.000/0001-00"
              aria-invalid={cnpjError ? true : undefined}
              aria-describedby={
                cnpjError ? 'checkoutCnpj-help checkoutCnpj-error' : 'checkoutCnpj-help'
              }
              onChange={(event) => setCnpjDraft(event.target.value)}
            />
            <p id="checkoutCnpj-help" className="text-muted-foreground text-xs">
              A fatura é emitida no CNPJ do escritório. Fica gravado nas{' '}
              <Link
                to="/configuracoes/contabilidade"
                className="text-primary underline underline-offset-2"
              >
                configurações da Contabilidade
              </Link>
              .
            </p>
            {cnpjError ? (
              <p id="checkoutCnpj-error" role="alert" className="text-danger text-xs">
                {cnpjError}
              </p>
            ) : null}
          </div>
        )}

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {PAID_PLANS.map((plan) => (
            <PlanCard
              key={plan.name}
              plan={plan}
              cycle={cycle}
              override={override}
              highlighted={plan.name === highlighted}
              current={subscription?.status === 'ACTIVE' && subscription.planName === plan.name}
              disabled={!isOwner || checkout.isPending}
              pending={checkout.isPending && checkout.variables?.planName === plan.name}
              onSubscribe={() => void subscribe(plan.name as PaidPlanName)}
            />
          ))}
        </div>

        <PlanComparison highlighted={highlighted} override={override} />
      </div>
    </div>
  );
}
