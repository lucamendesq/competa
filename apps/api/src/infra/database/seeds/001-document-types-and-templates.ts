import { sql } from 'drizzle-orm';

import { db } from '../index.js';
import { checklistTemplate, checklistTemplateItem, documentType } from '../schema/index.js';
import type { DocumentCategory, Periodicity } from '@competa/contracts';

export type CatalogEntry = {
  id: string;
  name: string;
  category: DocumentCategory;
  acceptedFormats: string[];
  description: string;
  periodicity?: Periodicity;
  annualMonth?: number;
  dueDay?: number;
  dueMonthOffset?: number;
};

export const CATALOG = {
  nf_emitidas: {
    id: '01a06884-9734-7edd-85b7-211499b83941',
    name: 'Notas fiscais emitidas',
    category: 'fiscal',
    acceptedFormats: ['xml', 'pdf', 'zip'],
    description: 'Envie os XMLs/PDFs das notas emitidas no mês, ou o .zip exportado do seu emissor',
    dueDay: 5,
  },
  nf_entrada: {
    id: '01a06884-9735-78d5-bf28-39923f7ce1d9',
    name: 'Notas fiscais de entrada (compras)',
    category: 'fiscal',
    acceptedFormats: ['xml', 'pdf', 'zip'],
    description: 'Notas de compras de mercadorias/insumos do mês',
    dueDay: 5,
  },
  nf_servicos_tomados: {
    id: '01a06884-9736-73b5-97f4-36ec040d6bac',
    name: 'Notas de serviços tomados',
    category: 'fiscal',
    acceptedFormats: ['xml', 'pdf', 'zip'],
    description: 'Notas de serviços contratados, especialmente com retenção de ISS/INSS/IRRF',
    dueDay: 5,
  },
  cupons_fiscais: {
    id: '01a06884-9737-7119-8881-51ac9f592e31',
    name: 'Cupons fiscais / NFC-e',
    category: 'fiscal',
    acceptedFormats: ['pdf', 'zip'],
    description: 'Relatório ou arquivos das vendas de varejo do mês',
    dueDay: 5,
  },
  relatorio_cartao: {
    id: '01a06884-9738-768e-9d80-b1a2113ec83d',
    name: 'Relatório de vendas de cartão (adquirente)',
    category: 'fiscal',
    acceptedFormats: ['pdf', 'csv', 'xlsx'],
    description: 'Relatório mensal da Stone/Cielo/Rede/PagSeguro etc.',
    dueDay: 5,
  },
  relatorio_marketplace: {
    id: '01a06884-9739-7f74-a828-d214ab703886',
    name: 'Relatório de marketplace',
    category: 'fiscal',
    acceptedFormats: ['pdf', 'csv', 'xlsx'],
    description: 'Extrato de vendas do Mercado Livre/Shopee/Amazon/iFood etc.',
    dueDay: 5,
  },
  inventario_estoque: {
    id: '01a06884-973a-78e7-a2bc-ac5b7b2217eb',
    name: 'Inventário de estoque',
    category: 'fiscal',
    acceptedFormats: ['pdf', 'xlsx'],
    description: 'Contagem de estoque em 31/12',
    periodicity: 'annual',
    annualMonth: 12,
  },
  relatorio_anual_receitas_mei: {
    id: '01a06884-973b-7fa4-a8fe-ade8f2d08e10',
    name: 'Relatório anual de receitas (MEI)',
    category: 'fiscal',
    acceptedFormats: ['pdf', 'xlsx'],
    description: 'Base para a DASN-SIMEI',
    periodicity: 'annual',
    annualMonth: 12,
  },
  extrato_bancario: {
    id: '01a06884-973c-7be1-bc3d-ecf880abc978',
    name: 'Extrato bancário',
    category: 'financial',
    acceptedFormats: ['pdf', 'ofx'],
    description: 'Extrato completo do mês de TODAS as contas PJ (PDF e OFX se possível)',
    dueDay: 5,
  },
  extrato_aplicacoes: {
    id: '01a06884-973d-7caa-b13c-3b5d36a9fe74',
    name: 'Extrato de aplicações financeiras',
    category: 'financial',
    acceptedFormats: ['pdf'],
    description: 'Extrato mensal de investimentos/aplicações da empresa',
    dueDay: 5,
  },
  extrato_cartao_pj: {
    id: '01a06884-973e-7ee1-84eb-cf4e53b39b42',
    name: 'Extrato de cartão de crédito PJ',
    category: 'financial',
    acceptedFormats: ['pdf', 'ofx'],
    description: 'Fatura fechada do mês do cartão da empresa',
    dueDay: 5,
  },
  extrato_conta_digital: {
    id: '01a06884-973f-7250-bc5d-c120f3e2b64a',
    name: 'Extrato de conta digital / gateway',
    category: 'financial',
    acceptedFormats: ['pdf', 'csv'],
    description: 'Mercado Pago, PagSeguro, Stripe, PayPal etc.',
    dueDay: 5,
  },
  livro_caixa: {
    id: '01a06884-9740-7b99-be5c-24684018ef50',
    name: 'Livro caixa',
    category: 'financial',
    acceptedFormats: ['pdf', 'xlsx', 'csv'],
    description: 'Movimento de entradas e saídas em dinheiro do mês',
  },
  emprestimos: {
    id: '01a06884-9741-7d4b-b891-25bf3d9fc10c',
    name: 'Comprovantes de empréstimos/financiamentos',
    category: 'financial',
    acceptedFormats: ['pdf'],
    description: 'Contrato (novo) e comprovantes das parcelas pagas no mês',
  },
  informe_rendimentos_bancarios: {
    id: '01a06884-9742-74a2-8f2b-9e9d696fe751',
    name: 'Informe de rendimentos bancários',
    category: 'financial',
    acceptedFormats: ['pdf'],
    description: 'Informes anuais dos bancos (para ECF/IRPJ)',
    periodicity: 'annual',
    annualMonth: 1,
  },
  aluguel: {
    id: '01a06884-9743-7049-8287-3f699aa20a68',
    name: 'Aluguel',
    category: 'expense',
    acceptedFormats: ['pdf'],
    description: 'Recibo ou boleto pago do aluguel do mês',
  },
  contas_consumo: {
    id: '01a06884-9744-7e92-99b8-a29c136f98d0',
    name: 'Contas de consumo',
    category: 'expense',
    acceptedFormats: ['pdf', 'zip'],
    description: 'Energia, água, telefone e internet do mês',
  },
  recibos_autonomos: {
    id: '01a06884-9745-7785-a22c-aed73d6731db',
    name: 'Recibos de autônomos (RPA)',
    category: 'expense',
    acceptedFormats: ['pdf'],
    description: 'Recibos de serviços tomados de pessoas físicas',
  },
  comprovante_prolabore: {
    id: '01a06884-9746-7738-88e2-f085af07393d',
    name: 'Comprovante de pró-labore',
    category: 'expense',
    acceptedFormats: ['pdf'],
    description: 'Comprovante de pagamento do pró-labore dos sócios',
  },
  outras_despesas: {
    id: '01a06884-9747-7e62-87a8-0060dfeb46fb',
    name: 'Outras despesas dedutíveis',
    category: 'expense',
    acceptedFormats: ['pdf', 'zip'],
    description: 'Combustível, viagens, assinaturas de software etc.',
  },

  variaveis_folha: {
    id: '01a06884-9748-7847-ab62-bb51ad70e6d6',
    name: 'Variáveis da folha',
    category: 'payroll',
    acceptedFormats: ['pdf', 'xlsx'],
    description: 'Horas extras, faltas, comissões, adicionais do mês',
    dueDay: 25,
    dueMonthOffset: 0,
  },
  atestados_medicos: {
    id: '01a06884-9749-73e8-ad29-e2bee1984232',
    name: 'Atestados médicos',
    category: 'payroll',
    acceptedFormats: ['pdf', 'jpg', 'png'],
    description: 'Atestados apresentados no mês (dado sensível — sigilo)',
    dueDay: 25,
    dueMonthOffset: 0,
  },
  comprovantes_salarios: {
    id: '01a06884-974a-757c-af09-7d342edda43f',
    name: 'Comprovantes de pagamento de salários',
    category: 'payroll',
    acceptedFormats: ['pdf', 'zip'],
    description: 'Comprovantes bancários dos salários pagos',
  },
  documentos_admissao: {
    id: '01a06884-974b-7004-9fb8-dea4be9ced36',
    name: 'Documentos de admissão',
    category: 'payroll',
    acceptedFormats: ['pdf', 'zip'],
    description: 'RG, CPF, CTPS digital, ASO admissional, contrato',
    periodicity: 'on_demand',
  },
  documentos_rescisao: {
    id: '01a06884-974c-76f3-9575-846859d4d2c8',
    name: 'Documentos de rescisão',
    category: 'payroll',
    acceptedFormats: ['pdf', 'zip'],
    description: 'Aviso prévio, ASO demissional, termo assinado',
    periodicity: 'on_demand',
  },
  documentos_ferias: {
    id: '01a06884-974d-77d0-9d83-86326e317a30',
    name: 'Documentos de férias',
    category: 'payroll',
    acceptedFormats: ['pdf'],
    description: 'Aviso e recibo de férias assinados',
    periodicity: 'on_demand',
  },
  das_pago: {
    id: '01a06884-974e-75cb-991a-44381e993d30',
    name: 'DAS pago',
    category: 'tax',
    acceptedFormats: ['pdf'],
    description: 'Comprovante de pagamento do DAS do mês',
    dueDay: 25,
  },
  darfs_pagos: {
    id: '01a06884-974f-7642-92f5-9ae800f98067',
    name: 'DARFs pagos (IRPJ/CSLL/PIS/COFINS)',
    category: 'tax',
    acceptedFormats: ['pdf', 'zip'],
    description: 'Comprovantes dos DARFs pagos no período',
    dueDay: 25,
  },
  guia_icms: {
    id: '01a06884-9750-7cc0-8bc5-073a229e4c51',
    name: 'Guia ICMS / ICMS-ST',
    category: 'tax',
    acceptedFormats: ['pdf'],
    description: 'Comprovante da guia estadual paga',
    dueDay: 25,
  },
  guia_iss: {
    id: '01a06884-9751-7147-82ea-f5de06f527a0',
    name: 'Guia ISS',
    category: 'tax',
    acceptedFormats: ['pdf'],
    description: 'Comprovante do ISS próprio e retido',
    dueDay: 25,
  },
  fgts_inss: {
    id: '01a06884-9752-7cfd-bb2b-144002b0419f',
    name: 'FGTS e INSS (eSocial/DCTFWeb)',
    category: 'tax',
    acceptedFormats: ['pdf', 'zip'],
    description: 'Guia FGTS Digital e DARF do eSocial pagos',
    dueDay: 25,
  },
  parcelamentos: {
    id: '01a06884-9753-7d1b-af45-c9632c81cacb',
    name: 'Parcelamentos',
    category: 'tax',
    acceptedFormats: ['pdf'],
    description: 'Comprovantes das parcelas de parcelamentos tributários',
  },
  contrato_social: {
    id: '01a06884-9754-7f2e-96d4-6ef026928f6c',
    name: 'Contrato social / alterações',
    category: 'corporate',
    acceptedFormats: ['pdf'],
    description: 'Contrato social e alterações registradas',
    periodicity: 'on_demand',
  },
  cartao_cnpj: {
    id: '01a06884-9755-79bd-82e3-27a4554c5f06',
    name: 'Cartão CNPJ e inscrições',
    category: 'corporate',
    acceptedFormats: ['pdf'],
    description: 'CNPJ, inscrição estadual e municipal',
    periodicity: 'on_demand',
  },
  certificado_digital: {
    id: '01a06884-9756-7914-9c83-7efe4ae0ef78',
    name: 'Certificado digital',
    category: 'corporate',
    acceptedFormats: ['pfx', 'pdf'],
    description: 'Arquivo A1 na renovação (tratar com segurança reforçada)',
    periodicity: 'on_demand',
  },
  alvaras: {
    id: '01a06884-9757-74d6-b5e5-5d9f342f25b4',
    name: 'Alvarás e licenças',
    category: 'corporate',
    acceptedFormats: ['pdf'],
    description: 'Alvarás/licenças renovados',
    periodicity: 'on_demand',
  },
  ativo_imobilizado: {
    id: '01a06884-9758-7d13-a1a5-e393e016e4a4',
    name: 'Notas de ativo imobilizado',
    category: 'corporate',
    acceptedFormats: ['pdf', 'xml'],
    description: 'Compra/venda de máquinas, veículos, equipamentos',
    periodicity: 'on_demand',
  },
  contratos_relevantes: {
    id: '01a06884-9759-7571-80e5-4ceafa3f86d4',
    name: 'Contratos relevantes',
    category: 'corporate',
    acceptedFormats: ['pdf'],
    description: 'Locação, leasing, contratos societários novos',
    periodicity: 'on_demand',
  },
} as const satisfies Record<string, CatalogEntry>;

export type CatalogKey = keyof typeof CATALOG;

type ConditionFlag = 'has_employees' | 'accepts_card_payments' | 'has_inventory';
type TemplateItem = CatalogKey | readonly [CatalogKey, ConditionFlag];

const CARTAO: TemplateItem = ['relatorio_cartao', 'accepts_card_payments'];
const FOLHA_CONDICIONAL: readonly TemplateItem[] = [
  ['variaveis_folha', 'has_employees'],
  ['atestados_medicos', 'has_employees'],
  ['fgts_inss', 'has_employees'],
];
const FOLHA_SEMPRE: readonly TemplateItem[] = ['variaveis_folha', 'atestados_medicos', 'fgts_inss'];

export const TEMPLATES = [
  {
    id: '01a06884-975a-7e02-a389-b50449a5afe3',
    name: 'Template MEI',
    items: [
      'nf_emitidas',
      'nf_entrada',
      CARTAO,
      'extrato_bancario',
      'livro_caixa',
      ...FOLHA_CONDICIONAL,
      'das_pago',
      'relatorio_anual_receitas_mei',
    ],
  },
  {
    id: '01a06884-975b-7482-99c7-3c00f09d2540',
    name: 'Template Simples — Serviços',
    items: [
      'nf_emitidas',
      'nf_servicos_tomados',
      CARTAO,
      'extrato_bancario',
      'extrato_cartao_pj',
      'livro_caixa',
      'aluguel',
      'contas_consumo',
      'comprovante_prolabore',
      ...FOLHA_CONDICIONAL,
      'das_pago',
      'guia_iss',
    ],
  },
  {
    id: '01a06884-975c-77b8-9e22-fb39dfa4c600',
    name: 'Template Simples — Comércio',
    items: [
      'nf_emitidas',
      'nf_entrada',
      'nf_servicos_tomados',
      'cupons_fiscais',
      CARTAO,
      'extrato_bancario',
      'extrato_cartao_pj',
      'livro_caixa',
      'aluguel',
      'contas_consumo',
      'comprovante_prolabore',
      ...FOLHA_CONDICIONAL,
      'das_pago',
      'guia_icms',
      'guia_iss',
      ['inventario_estoque', 'has_inventory'],
    ],
  },
  {
    id: '01a06884-975d-7af2-84f7-c5e8b890ccd3',
    name: 'Template Lucro Presumido',
    items: [
      'nf_emitidas',
      'nf_entrada',
      'nf_servicos_tomados',
      'cupons_fiscais',
      CARTAO,
      'extrato_bancario',
      'extrato_cartao_pj',
      'livro_caixa',
      'aluguel',
      'contas_consumo',
      'comprovante_prolabore',
      ...FOLHA_SEMPRE,
      'darfs_pagos',
      'guia_icms',
      'guia_iss',
      ['inventario_estoque', 'has_inventory'],
    ],
  },
  {
    id: '01a06884-975e-7db9-9d78-16ad3c989319',
    name: 'Template Lucro Real',
    items: [
      'nf_emitidas',
      'nf_entrada',
      'nf_servicos_tomados',
      'cupons_fiscais',
      CARTAO,
      'extrato_bancario',
      'extrato_cartao_pj',
      'livro_caixa',
      'aluguel',
      'contas_consumo',
      'comprovante_prolabore',
      ...FOLHA_SEMPRE,
      'darfs_pagos',
      'guia_icms',
      'guia_iss',
      'inventario_estoque',
    ],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  name: string;
  items: readonly TemplateItem[];
}>;

export default async function seedDocumentTypes() {
  await db.transaction(async (tx) => {
    const rows = Object.values(CATALOG).map((entry) => ({
      id: entry.id,
      accountingFirmId: null,
      name: entry.name,
      category: entry.category,
      acceptedFormats: [...entry.acceptedFormats],
      description: entry.description,
    }));

    await tx
      .insert(documentType)
      .values(rows)
      .onConflictDoUpdate({
        target: documentType.id,
        set: {
          name: sql`excluded.name`,
          category: sql`excluded.category`,
          acceptedFormats: sql`excluded.accepted_formats`,
          description: sql`excluded.description`,
        },
      });

    await tx
      .insert(checklistTemplate)
      .values(
        TEMPLATES.map((template) => ({
          id: template.id,
          accountingFirmId: null,
          name: template.name,
        })),
      )
      .onConflictDoUpdate({
        target: checklistTemplate.id,
        set: { name: sql`excluded.name` },
      });

    const items = TEMPLATES.flatMap((template) =>
      template.items.map((item) => {
        const [key, conditionFlag] = typeof item === 'string' ? [item, null] : item;
        const entry: CatalogEntry = CATALOG[key];

        return {
          checklistTemplateId: template.id,
          documentTypeId: entry.id,
          periodicity: entry.periodicity ?? 'monthly',
          annualMonth: entry.annualMonth ?? null,
          dueDay: entry.dueDay ?? null,
          dueMonthOffset: entry.dueMonthOffset ?? 1,
          conditionFlag,
          required: true,
        };
      }),
    );

    await tx
      .insert(checklistTemplateItem)
      .values(items)
      .onConflictDoUpdate({
        target: [checklistTemplateItem.checklistTemplateId, checklistTemplateItem.documentTypeId],
        set: {
          periodicity: sql`excluded.periodicity`,
          annualMonth: sql`excluded.annual_month`,
          dueDay: sql`excluded.due_day`,
          dueMonthOffset: sql`excluded.due_month_offset`,
          conditionFlag: sql`excluded.condition_flag`,
          required: sql`excluded.required`,
        },
      });
  });
}
