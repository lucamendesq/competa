import { Injectable, Logger } from '@nestjs/common';
import { BillingProvider } from './billing.provider.js';
import env from '../../../config/env.js';

interface AsaasCustomerListResponse {
  data?: Array<{ id: string }>;
}

interface AsaasCustomerResponse {
  id: string;
}

interface AsaasSubscriptionResponse {
  id: string;
}

interface AsaasPaymentLinkResponse {
  url: string;
}

@Injectable()
export class AsaasBilling implements BillingProvider {
  private readonly logger = new Logger(AsaasBilling.name);
  private readonly baseUrl = env.ASAAS_SANDBOX 
    ? 'https://sandbox.asaas.com/api/v3'
    : 'https://api.asaas.com/v3';

  async getOrCreateCustomer(input: { name: string; email: string; cpfCnpj?: string }) {
    // 1. Tenta buscar cliente existente pelo email ou CPF/CNPJ
    const searchUrl = new URL(`${this.baseUrl}/customers`);
    if (input.cpfCnpj) searchUrl.searchParams.append('cpfCnpj', input.cpfCnpj);
    else searchUrl.searchParams.append('email', input.email);

    const searchRes = await fetch(searchUrl.toString(), {
      headers: { access_token: env.ASAAS_API_KEY! }
    });
    
    const searchData = (await searchRes.json()) as AsaasCustomerListResponse;

    if (searchData.data && searchData.data.length > 0) {
      return { customerId: searchData.data[0].id };
    }

    // 2. Se não existir, cria um novo
    const createRes = await fetch(`${this.baseUrl}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: env.ASAAS_API_KEY!
      },
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        cpfCnpj: input.cpfCnpj
      })
    });

    const createData = (await createRes.json()) as AsaasCustomerResponse;
    
    if (!createRes.ok) {
      this.logger.error('Falha ao criar cliente no Asaas:', createData);
      throw new Error('Falha na integração de pagamento');
    }

    return { customerId: createData.id };
  }

  async createSubscription(input: { customerId: string; planName: string; value: number }) {
    // Cria uma assinatura cobrada via Cartão/Pix/Boleto, gerando um link de pagamento
    const payload = {
      customer: input.customerId,
      billingType: 'UNDEFINED', // Deixa o cliente escolher na tela de checkout
      value: input.value,
      nextDueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString().split('T')[0], // Daqui a 3 dias
      cycle: 'MONTHLY',
      description: `Plano ${input.planName} - Competa`
    };

    const res = await fetch(`${this.baseUrl}/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: env.ASAAS_API_KEY!
      },
      body: JSON.stringify(payload)
    });

    const data = (await res.json()) as AsaasSubscriptionResponse;

    if (!res.ok) {
      this.logger.error('Falha ao criar assinatura no Asaas:', data);
      throw new Error('Falha na integração de pagamento');
    }

    // O Asaas geralmente retorna a URL da fatura (invoiceUrl) no webhook, 
    // ou na assinatura podemos direcionar pro link de pagamento
    const checkoutUrl = await this.getPaymentLink(input.customerId, input.value, input.planName);

    return { 
      subscriptionId: data.id, 
      checkoutUrl
    };
  }

  private async getPaymentLink(customerId: string, value: number, planName: string) {
    // Para simplificar a experiência, geramos um Link de Pagamento no Asaas
    const res = await fetch(`${this.baseUrl}/paymentLinks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: env.ASAAS_API_KEY!
      },
      body: JSON.stringify({
        name: `Plano ${planName}`,
        description: 'Assinatura mensal do software Competa',
        chargeType: 'RECURRENT',
        endDate: null,
        value,
        billingType: 'UNDEFINED'
      })
    });

    const data = (await res.json()) as AsaasPaymentLinkResponse;
    if (res.ok) {
      return data.url;
    }
    
    this.logger.error('Falha ao criar link de checkout no Asaas', data);
    return 'https://asaas.com';
  }
}
