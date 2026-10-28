import { Logger } from '../../../lib/logger.js';
import type { BillingCycle } from '@competa/contracts';
import { BillingProvider } from './billing.provider.js';
import env from '../../../config/env.js';

interface AsaasList<T> {
  data?: T[];
}

interface AsaasCustomer {
  id: string;
  cpfCnpj?: string | null;
}

interface AsaasSubscription {
  id: string;
}

interface AsaasPayment {
  id: string;
  status?: string;
  invoiceUrl?: string;
}

const OPEN_PAYMENT_STATUSES = new Set(['PENDING', 'OVERDUE']);

/** O Asaas gera a primeira cobrança logo após criar a assinatura, mas não há garantia de
 *  que ela já exista na resposta seguinte. Poucas tentativas curtas resolvem a corrida sem
 *  segurar a requisição do Contador. */
const INVOICE_ATTEMPTS = 3;
const INVOICE_RETRY_MS = 400;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class AsaasBilling implements BillingProvider {
  readonly simulated = false;
  private readonly logger = new Logger(AsaasBilling.name);
  private readonly baseUrl = env.ASAAS_SANDBOX
    ? 'https://sandbox.asaas.com/api/v3'
    : 'https://api.asaas.com/v3';

  private headers() {
    return { 'Content-Type': 'application/json', access_token: env.ASAAS_API_KEY! };
  }

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers: this.headers() });
    const data = (await res.json().catch(() => ({}))) as T;

    if (!res.ok) {
      this.logger.error(`Asaas ${init?.method ?? 'GET'} ${path} falhou (${res.status})`, data);
      throw new Error('Falha na integração de pagamento');
    }

    return data;
  }

  async getOrCreateCustomer(input: {
    name: string;
    email: string;
    externalReference: string;
    cpfCnpj: string;
  }) {
    /* A busca é pelo `externalReference` (id da Contabilidade), NUNCA pelo e-mail: firmas
     * sem e-mail de contato caíam num endereço de fallback compartilhado e colidiam todas
     * no mesmo cliente do gateway. */
    const found = await this.call<AsaasList<AsaasCustomer>>(
      `/customers?externalReference=${encodeURIComponent(input.externalReference)}`,
    );
    const existing = found.data?.[0];
    if (existing) {
      /* Cliente criado antes de o CNPJ ser exigido, ou com CNPJ corrigido depois: sem o
       * documento o Asaas recusa a cobrança, não o cliente. */
      if (existing.cpfCnpj !== input.cpfCnpj) {
        await this.call<unknown>(`/customers/${existing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ cpfCnpj: input.cpfCnpj }),
        });
      }
      return { customerId: existing.id };
    }

    const created = await this.call<AsaasCustomer>('/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        cpfCnpj: input.cpfCnpj,
        externalReference: input.externalReference,
      }),
    });

    return { customerId: created.id };
  }

  async createSubscription(input: {
    customerId: string;
    planName: string;
    cycle: BillingCycle;
    value: number;
    externalReference: string;
  }) {
    const yearly = input.cycle === 'yearly';

    /* No anual a taxa do gateway é o maior custo variável do cliente: R$1,99 fixos no
     * boleto contra ~3% no cartão (R$56,99 num anual de R$1.890). O Asaas não faz
     * recorrência Pix pura — o Pix vai como QR Code embutido no boleto. */
    const subscription = await this.call<AsaasSubscription>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        customer: input.customerId,
        billingType: yearly ? 'BOLETO' : 'UNDEFINED',
        value: input.value,
        nextDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString().split('T')[0],
        cycle: yearly ? 'YEARLY' : 'MONTHLY',
        description: `Plano ${input.planName} (${yearly ? 'anual' : 'mensal'}) - Competa`,
        externalReference: input.externalReference,
      }),
    });

    const invoice = await this.firstInvoice(subscription.id);

    return {
      subscriptionId: subscription.id,
      paymentId: invoice.id,
      checkoutUrl: invoice.invoiceUrl,
    };
  }

  /** `GET /subscriptions/{id}/payments` → a cobrança gerada. É o `invoiceUrl` dela que o
   *  pagador deve abrir: o pagamento feito nele nasce com `payment.subscription` preenchido,
   *  que é o que o webhook usa para achar a Contabilidade; o `id` fica gravado para o webhook
   *  saber que o pagamento é desta fatura. */
  private async firstInvoice(subscriptionId: string) {
    for (let attempt = 1; attempt <= INVOICE_ATTEMPTS; attempt += 1) {
      const payments = await this.call<AsaasList<AsaasPayment>>(
        `/subscriptions/${subscriptionId}/payments`,
      );
      const payment = payments.data?.[0];
      if (payment?.invoiceUrl) return { id: payment.id, invoiceUrl: payment.invoiceUrl };

      if (attempt < INVOICE_ATTEMPTS) await sleep(INVOICE_RETRY_MS);
    }

    this.logger.error(`Assinatura ${subscriptionId} criada sem cobrança para faturar`);
    throw new Error('Falha na integração de pagamento');
  }

  /* `updatePendingPayments: true` conserta a cobrança JÁ emitida em vez de deixar o cliente
   * com um boleto do plano antigo. Verificado no sandbox: a mesma fatura muda de valor
   * (`pay_...` idêntico antes e depois), então o link que ele já tem continua valendo.
   *
   * O `value` NÃO está no OpenAPI do Asaas, nem no PT nem no EN — só no FAQ. Testado contra
   * o sandbox antes de entrar aqui: 100 → 250 → 1890, relendo a assinatura a cada passo. */
  async changeSubscriptionPlan(
    subscriptionId: string,
    input: { planName: string; cycle: BillingCycle; value: number },
  ) {
    const yearly = input.cycle === 'yearly';

    await this.call<unknown>(`/subscriptions/${subscriptionId}`, {
      method: 'PUT',
      body: JSON.stringify({
        value: input.value,
        cycle: yearly ? 'YEARLY' : 'MONTHLY',
        billingType: yearly ? 'BOLETO' : 'UNDEFINED',
        description: `Plano ${input.planName} (${yearly ? 'anual' : 'mensal'}) - Competa`,
        updatePendingPayments: true,
      }),
    });
  }

  /* `status: INACTIVE` e não `DELETE`: remover a assinatura apaga junto as cobranças
   * pendentes e vencidas dela (FAQ de assinaturas do Asaas), e um boleto em aberto viraria
   * receita perdida na troca de plano. Inativa para de gerar cobrança nova e mantém as que
   * já existem. */
  async deactivateSubscription(subscriptionId: string) {
    await this.call<unknown>(`/subscriptions/${subscriptionId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
  }

  async cancelSubscription(subscriptionId: string) {
    await this.call<unknown>(`/subscriptions/${subscriptionId}`, { method: 'DELETE' });
  }

  /* Vencida também conta: a firma OVERDUE paga a fatura vencida, não uma nova. O filtro por
   * status da API aceita um valor só, então a lista vem inteira e o corte é aqui. */
  async pendingInvoice(subscriptionId: string) {
    const payments = await this.call<AsaasList<AsaasPayment>>(
      `/subscriptions/${subscriptionId}/payments`,
    );
    const open = payments.data?.find(
      (payment) => payment.invoiceUrl && OPEN_PAYMENT_STATUSES.has(payment.status ?? ''),
    );

    return open ? { id: open.id, invoiceUrl: open.invoiceUrl! } : null;
  }
}
