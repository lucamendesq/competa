import { sql } from 'drizzle-orm';

import { db } from '../index.js';
import { documentType } from '../schema/document.js';

const PRODUCT_CATALOG_FIRM_ID = null;

export const productDocumentTypes = [
  {
    id: '01a0642e-cf4d-7661-8bb1-75131ae1b9e7',
    accountingFirmId: PRODUCT_CATALOG_FIRM_ID,
    name: 'Notas fiscais de vendas e serviços emitidas',
    category: 'fiscal',
    acceptedFormats: ['xml', 'pdf', 'zip'],
    description: 'Envie todas as notas fiscais emitidas no período, de produtos e/ou serviços.',
  },
  {
    id: '01a0642e-cf4d-77d3-a482-a025c2d87bf8',
    accountingFirmId: PRODUCT_CATALOG_FIRM_ID,
    name: 'Notas fiscais de compras e serviços tomados',
    category: 'fiscal',
    acceptedFormats: ['xml', 'pdf', 'zip'],
    description:
      'Envie notas de compras, mercadorias, insumos e serviços contratados ou recebidos no período.',
  },
  {
    id: '01a0642e-cf4d-7227-aabd-d3bee0c1e4e6',
    accountingFirmId: PRODUCT_CATALOG_FIRM_ID,
    name: 'Extratos bancários de todas as contas',
    category: 'financial',
    acceptedFormats: ['pdf', 'csv', 'ofx', 'xlsx', 'zip'],
    description:
      'Envie o extrato completo do período de cada conta bancária da empresa, mesmo sem movimentação.',
  },
  {
    id: '01a0642e-cf4d-7c26-ac0b-2a434550610f',
    accountingFirmId: PRODUCT_CATALOG_FIRM_ID,
    name: 'Extratos de cartões e meios de pagamento',
    category: 'financial',
    acceptedFormats: ['pdf', 'csv', 'xlsx', 'zip'],
    description:
      'Envie faturas e extratos de cartões corporativos, maquininhas, gateways e plataformas de pagamento.',
  },
  {
    id: '01a0642e-cf4d-7235-8104-be6d960a9056',
    accountingFirmId: PRODUCT_CATALOG_FIRM_ID,
    name: 'Comprovantes de movimentações bancárias',
    category: 'financial',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'zip'],
    description:
      'Envie comprovantes de PIX, transferências, pagamentos, saques, depósitos e outras movimentações que precisem de identificação.',
  },
  {
    id: '01a0642e-cf4d-797f-b07c-31588ac34a63',
    accountingFirmId: PRODUCT_CATALOG_FIRM_ID,
    name: 'Comprovantes de despesas operacionais',
    category: 'expense',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'zip'],
    description:
      'Envie notas, recibos e comprovantes de despesas como aluguel, energia, água, internet, telefone, combustível e materiais.',
  },
  {
    id: '01a0642e-cf4d-7aa5-9704-708648dd97ce',
    accountingFirmId: PRODUCT_CATALOG_FIRM_ID,
    name: 'Admissões e alterações de colaboradores',
    category: 'payroll',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'zip'],
    description:
      'Envie documentos de admissão, mudança salarial, alteração cadastral, função ou jornada.',
  },
  {
    id: '01a0642e-cf4d-7cc3-80b0-8b727abcaf87',
    accountingFirmId: PRODUCT_CATALOG_FIRM_ID,
    name: 'Controle de ponto e variáveis da folha',
    category: 'payroll',
    acceptedFormats: ['pdf', 'xlsx', 'csv', 'zip'],
    description:
      'Envie espelhos de ponto, horas extras, faltas, comissões, adicionais e outros eventos variáveis do período.',
  },
  {
    id: '01a0642e-cf4d-7c45-af8a-37c9eb79687f',
    accountingFirmId: PRODUCT_CATALOG_FIRM_ID,
    name: 'Férias, afastamentos e licenças',
    category: 'payroll',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'zip'],
    description:
      'Envie avisos, recibos, atestados, comunicações e documentos de férias, afastamentos, licenças ou retorno ao trabalho.',
  },
  {
    id: '01a0642e-cf4d-736b-b09d-15834f289524',
    accountingFirmId: PRODUCT_CATALOG_FIRM_ID,
    name: 'Desligamentos e rescisões',
    category: 'payroll',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'zip'],
    description:
      'Envie aviso, documentos de rescisão, comprovantes e informações de desligamento, se houver.',
  },
  {
    id: '01a0642e-cf4d-7200-87f9-c43abfa7ef30',
    accountingFirmId: PRODUCT_CATALOG_FIRM_ID,
    name: 'Pró-labore e pagamentos a sócios',
    category: 'payroll',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'zip'],
    description:
      'Envie comprovantes e informações sobre pró-labore, distribuição, adiantamentos ou outros pagamentos a sócios.',
  },
  {
    id: '01a0642e-cf4d-789f-ab5b-d0f9ddb400cc',
    accountingFirmId: PRODUCT_CATALOG_FIRM_ID,
    name: 'Comprovantes de pagamento de tributos',
    category: 'tax',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'zip'],
    description:
      'Envie guias e comprovantes efetivamente pagos de impostos e contribuições federais, estaduais e municipais.',
  },
  {
    id: '01a0642e-cf4d-7f35-bb41-4681f0a94a8b',
    accountingFirmId: PRODUCT_CATALOG_FIRM_ID,
    name: 'Guias, notificações e parcelamentos tributários',
    category: 'tax',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'zip'],
    description:
      'Envie guias recebidas, avisos de cobrança, notificações, parcelamentos e documentos tributários relevantes.',
  },
  {
    id: '01a0642e-cf4d-7105-852a-0939e8d46784',
    accountingFirmId: PRODUCT_CATALOG_FIRM_ID,
    name: 'Alterações societárias e cadastrais',
    category: 'corporate',
    acceptedFormats: ['pdf', 'doc', 'docx', 'zip'],
    description:
      'Envie contrato social, alterações, procurações, mudança de endereço, CNAE, sócios ou dados cadastrais, quando ocorrer.',
  },
  {
    id: '01a0642e-cf4d-7508-a1d9-f9f7ba0f5629',
    accountingFirmId: PRODUCT_CATALOG_FIRM_ID,
    name: 'Outros documentos e ocorrências relevantes',
    category: 'corporate',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'xml', 'xlsx', 'csv', 'zip'],
    description:
      'Envie qualquer documento ou explicação relevante que não se encaixe nos itens anteriores, identificando o assunto e a data.',
  },
] satisfies (typeof documentType.$inferInsert)[];

export default async () => {
  const start = performance.now();
  await db
    .insert(documentType)
    .values(productDocumentTypes)
    .onConflictDoUpdate({
      target: documentType.id,
      set: {
        name: sql`excluded.name`,
        category: sql`excluded.category`,
        acceptedFormats: sql`excluded.accepted_formats`,
        description: sql`excluded.description`,
      },
    });
  const duration = performance.now() - start;
  console.log(`Query took ${duration.toFixed(2)}ms`);
};
