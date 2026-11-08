import { PAID_PLANS, PLANS, type Plan } from '@competa/contracts';
import { monthlyOf, type PriceOverride } from '@/features/billing/components/plan-card';
import { Callout } from '@/shared/components/callout';
import { brl } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';

const comparisonRows = (
  override: PriceOverride,
): { label: string; value: (plan: Plan) => string }[] => [
  { label: 'Preço por mês', value: (plan) => brl(monthlyOf(plan, override)) },
  { label: 'Empresas ativas', value: (plan) => `até ${plan.companyCap}` },
  { label: 'Contadores da equipe', value: () => '✓ Ilimitados' },
  { label: 'WhatsApp oficial no seu número', value: () => '✓ Sim' },
  {
    label: 'Lembretes automáticos',
    value: (plan) =>
      plan.capabilities.includes('reminderTuning')
        ? '✓ Cadência configurável'
        : '✓ Cadência padrão',
  },
  {
    label: 'Sua marca no link e nos e-mails',
    value: (plan) => (plan.capabilities.includes('branding') ? '✓ Sim' : '— Não'),
  },
  {
    label: 'Download em zip',
    value: (plan) =>
      plan.capabilities.includes('periodZip')
        ? '✓ Por empresa e da competência inteira'
        : '✓ Por empresa',
  },
  { label: 'Histórico dos documentos', value: () => '✓ 5 anos' },
];

export function PlanComparison({
  highlighted,
  override,
}: {
  highlighted: string;
  override: PriceOverride;
}) {
  const perCompany = brl(PLANS.profissional.priceMonthly / PLANS.profissional.companyCap);

  return (
    <>
      <section className="mt-10">
        <h3 className="font-display text-base font-semibold text-foreground">
          O que muda entre os planos
        </h3>
        <div className="border-border mt-3 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">
              Comparativo dos planos Essencial, Profissional e Escritório
            </caption>
            <thead>
              <tr className="border-border bg-muted/40 border-b">
                <th scope="col" className="text-foreground px-4 py-3 font-semibold">
                  &nbsp;
                </th>
                {PAID_PLANS.map((plan) => (
                  <th
                    key={plan.name}
                    scope="col"
                    className={cn(
                      'px-4 py-3 font-semibold',
                      plan.name === highlighted ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {plan.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonRows(override).map((row) => (
                <tr key={row.label} className="border-border/60 border-b last:border-0">
                  <th scope="row" className="text-foreground px-4 py-3 font-medium">
                    {row.label}
                  </th>
                  {PAID_PLANS.map((plan) => (
                    <td key={plan.name} className="text-muted-foreground px-4 py-3">
                      {row.value(plan)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="border-border rounded-xl border p-4">
          <h3 className="text-foreground text-sm font-semibold">
            Contadores ilimitados, de verdade
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Toda suíte cobra por usuário. Um escritório de 4 pessoas paga cerca de R$200/mês no Omie
            G-Click <strong className="text-foreground">só em assentos</strong>. Aqui, a 5ª pessoa
            da equipe custa R$0, em qualquer plano.
          </p>
        </section>
        <section className="border-border rounded-xl border p-4">
          <h3 className="text-foreground text-sm font-semibold">{perCompany} por cliente</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            No Profissional, {brl(PLANS.profissional.priceMonthly)} dividido por{' '}
            {PLANS.profissional.companyCap} empresas dá{' '}
            <strong className="text-foreground">{perCompany} por empresa/mês</strong>, contra um
            honorário de R$300 a R$500 que você cobra de cada uma.
          </p>
        </section>
      </div>

      <Callout
        tone="warning"
        heading="O WhatsApp é cobrado pela Meta, não por nós"
        className="mt-8"
      >
        A integração é no seu próprio número: você conecta sua conta oficial e a{' '}
        <strong>Meta cobra você direto</strong>, sem intermediário nem margem nossa. No uso típico
        de um escritório pequeno isso fica em <strong>R$10 a R$20/mês</strong>, e esse valor{' '}
        <strong>não está incluído</strong> no preço do Competa.
      </Callout>
    </>
  );
}
