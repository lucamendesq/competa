import * as z from 'zod';

/** Segundo eixo de upgrade (D18 §3): o que separa Essencial de Profissional além do volume. */
export const PLAN_CAPABILITIES = ['branding', 'reminderTuning', 'periodZip'] as const;
export type PlanCapability = (typeof PLAN_CAPABILITIES)[number];

export type Plan = {
  name: PlanName;
  label: string;
  /** Preço mensal em reais, cobrado por Contabilidade (não por Contador). */
  priceMonthly: number;
  /** Anual = 10× o mensal (2 meses grátis). */
  priceYearly: number;
  /** Teto de Empresas ativas cadastradas — a métrica de cobrança. */
  companyCap: number;
  capabilities: readonly PlanCapability[];
  pitch: string;
  highlights: string[];
};

export const PLAN_NAMES = ['trial', 'essencial', 'profissional', 'escritorio'] as const;
export type PlanName = (typeof PLAN_NAMES)[number];

export const PLANS: Record<PlanName, Plan> = {
  trial: {
    name: 'trial',
    label: 'Teste',
    priceMonthly: 0,
    priceYearly: 0,
    companyCap: 15,
    /** O teste mostra o produto inteiro: trial sem os gates venderia o plano errado. */
    capabilities: PLAN_CAPABILITIES,
    pitch: '14 dias para abrir a primeira competência, sem cartão.',
    highlights: [
      'Até 15 empresas ativas',
      'Contadores ilimitados',
      'Email + WhatsApp (seu número)',
      'Todos os recursos do Profissional',
    ],
  },
  essencial: {
    name: 'essencial',
    label: 'Essencial',
    priceMonthly: 119,
    priceYearly: 1190,
    companyCap: 30,
    capabilities: [],
    pitch: 'Para o escritório que está trocando o garimpo no WhatsApp por checklist.',
    highlights: [
      'Até 30 empresas ativas',
      'Contadores ilimitados',
      'Email + WhatsApp (seu número)',
      'Lembretes automáticos na cadência padrão',
      'Zip por empresa',
    ],
  },
  profissional: {
    name: 'profissional',
    label: 'Profissional',
    priceMonthly: 189,
    priceYearly: 1890,
    companyCap: 80,
    capabilities: PLAN_CAPABILITIES,
    pitch: 'A carteira média do escritório brasileiro inteira dentro do ciclo da competência.',
    highlights: [
      'Até 80 empresas ativas',
      'Contadores ilimitados',
      'Email + WhatsApp (seu número)',
      'Sua marca no link e nos e-mails',
      'Cadência de lembretes configurável',
      'Zip da competência inteira',
    ],
  },
  escritorio: {
    name: 'escritorio',
    label: 'Escritório',
    priceMonthly: 299,
    priceYearly: 2990,
    companyCap: 200,
    capabilities: PLAN_CAPABILITIES,
    pitch: 'Para quem passou dos 80 clientes e não quer pagar por usuário.',
    highlights: [
      'Até 200 empresas ativas',
      'Contadores ilimitados',
      'Email + WhatsApp (seu número)',
      'Sua marca no link e nos e-mails',
      'Cadência de lembretes configurável',
      'Zip da competência inteira',
    ],
  },
};

/** Planos que a tela de assinatura oferece — `trial` não se assina, se ganha no cadastro. */
export const PAID_PLAN_NAMES = ['essencial', 'profissional', 'escritorio'] as const;
export type PaidPlanName = (typeof PAID_PLAN_NAMES)[number];

export const PAID_PLANS: Plan[] = PAID_PLAN_NAMES.map((name) => PLANS[name]);

export const BILLING_CYCLES = ['monthly', 'yearly'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const CheckoutBody = z.object({
  planName: z.enum(PAID_PLAN_NAMES),
  cycle: z.enum(BILLING_CYCLES).default('monthly'),
});
export type CheckoutBody = z.infer<typeof CheckoutBody>;

/** Folga acima do teto antes de recusar o cadastro (D18 §7). Bater o muro no dia 5 trava o
 *  mês do cliente; o aviso é o prompt de upgrade mais honesto que existe. */
export const SOFT_CAP_FACTOR = 1.2;

export const planSoftCap = (companyCap: number): number => Math.floor(companyCap * SOFT_CAP_FACTOR);

/** Nome de plano desconhecido no banco cai no teto do trial em vez de virar ilimitado. */
export const planCompanyCap = (planName: string): number =>
  (PLANS[planName as PlanName] ?? PLANS.trial).companyCap;

/** Plano desconhecido no banco nega — e NÃO cai no trial como `planCompanyCap`: o trial tem
 *  as três capabilities, então cair nele seria exatamente o "tudo liberado" que o fallback
 *  existe para evitar. Teto desconhecido vira o menor; capability desconhecida vira nenhuma. */
export const planAllows = (planName: string, capability: PlanCapability): boolean =>
  PLANS[planName as PlanName]?.capabilities.includes(capability) ?? false;

/** Anual = 10 mensalidades (2 meses grátis). Vale para o preço público e para o override. */
export const YEARLY_MONTHS_CHARGED = 10;

/** Preço por plano **e por Contabilidade**: `overrideMonthly` é a Oferta Fundador, vinda de
 *  `subscription.price_override`. Null/ausente = preço público. */
export const planPrice = (
  plan: Plan,
  cycle: BillingCycle,
  overrideMonthly?: number | null,
): number => {
  const monthly = overrideMonthly ?? plan.priceMonthly;

  return cycle === 'yearly' ? monthly * YEARLY_MONTHS_CHARGED : monthly;
};

/** Desconto vitalício dos 10 primeiros escritórios (D18 §6). É um mapa por plano, não um
 *  número solto: o fundador que sobe de tier continua fundador. */
export type PriceOverride = Partial<Record<PaidPlanName, number>>;

export const FOUNDER_PRICE_OVERRIDE: PriceOverride = {
  essencial: 89,
  profissional: 139,
  escritorio: 219,
};

export const FOUNDER_SEATS = 10;
export const FOUNDER_OVERRIDE_REASON = 'fundador-2026';

/** Plano pago mais barato que libera a capability — o que a 402 recomenda e a web mostra
 *  no CTA. Derivado do catálogo para o gate não repetir "profissional" em três lugares. */
export const planRequiredFor = (capability: PlanCapability): PaidPlanName =>
  PAID_PLAN_NAMES.find((name) => PLANS[name].capabilities.includes(capability)) ?? 'escritorio';

/** Uma frase só para o gate: a 402 da API e o tooltip da web usam esta, então quem chega
 *  por link direto ou aba antiga lê exatamente o que o botão desabilitado dizia. */
export const planGateMessage = (capability: PlanCapability): string =>
  `Este recurso está disponível a partir do plano ${PLANS[planRequiredFor(capability)].label}.`;

/** Tier recomendado para quem tem `active` Empresas ativas: o mais barato que cobre. */
export const planForCompanies = (active: number): PaidPlanName =>
  PAID_PLAN_NAMES.find((name) => PLANS[name].companyCap >= active) ?? 'escritorio';
