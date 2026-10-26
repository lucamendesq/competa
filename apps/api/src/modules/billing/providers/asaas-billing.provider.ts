import { Logger } from '../../../lib/logger.js';
import type { BillingCycle } from '@competa/contracts';
import { BillingProvider } from './billing.provider.js';
import env from '../../../config/env.js';

interface AsaasList<T> {
  data?: T[];
}

interface AsaasCustomer {
  id: string;
}

interface AsaasSubscription {
  id: string;
}

interface AsaasPayment {
  invoiceUrl?: string;
}

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
    cpfCnpj?: string;
  }) {
    /* A busca é pelo `externalReference` (id da Contabilidade), NUNCA pelo e-mail: firmas
     * sem e-mail de contato caíam num endereço de fallback compartilhado e colidiam todas
     * no mesmo cliente do gateway. */
    const found = await this.call<AsaasList<AsaasCustomer>>(
      `/customers?externalReference=${encodeURIComponent(input.externalReference)}`,
    );
    const existing = found.data?.[0];
    if (existing) return { customerId: existing.id };

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

    return { subscriptionId: subscription.id, checkoutUrl: await this.invoiceUrl(subscription.id) };
  }

  /** `GET /subscriptions/{id}/payments` → `invoiceUrl` da cobrança gerada. É este o link que
   *  o pagador deve abrir: o pagamento feito nele nasce com `payment.subscription`
   *  preenchido, que é exatamente o que o webhook usa para achar a Contabilidade. */
  private async invoiceUrl(subscriptionId: string) {
    for (let attempt = 1; attempt <= INVOICE_ATTEMPTS; attempt += 1) {
      const payments = await this.call<AsaasList<AsaasPayment>>(
        `/subscriptions/${subscriptionId}/payments`,
      );
      const url = payments.data?.[0]?.invoiceUrl;
      if (url) return url;

      if (attempt < INVOICE_ATTEMPTS) await sleep(INVOICE_RETRY_MS);
    }

    this.logger.error(`Assinatura ${subscriptionId} criada sem cobrança para faturar`);
    throw new Error('Falha na integração de pagamento');
  }

  async cancelSubscription(subscriptionId: string) {
    await this.call<unknown>(`/subscriptions/${subscriptionId}`, { method: 'DELETE' });
  }
}
