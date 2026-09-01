# Catálogo de Documentos — Seed do Produto

> Conteúdo do seed das tabelas `document_type`, `checklist_template` e `checklist_template_item` (`accounting_firm_id IS NULL` = registros do produto, imutáveis).
> Nomes/descrições em PT-BR (são **dados** exibidos ao usuário; identificadores do banco em inglês). Estrutura das tabelas em [`database-schema.md`](./database-schema.md).
> Fonte: levantamento de domínio contábil BR (2026-08-26), validável com o contador design-partner.
> ⚠️ Alerta do discovery: NF-e tende a ser resolvida por captura automática na SEFAZ (Qive). O valor durável do produto está nas categorias `financial`, `expense` e `payroll` (documentos não estruturados).

## 1. Tipos de documento (`document_type`)

### category = `fiscal` (mensal)

| name | accepted_formats | description (instrução ao Responsável) |
|------|------------------|------------------------------------------|
| Notas fiscais emitidas | xml, pdf, zip | Envie os XMLs/PDFs das notas emitidas no mês, ou o .zip exportado do seu emissor |
| Notas fiscais de entrada (compras) | xml, pdf, zip | Notas de compras de mercadorias/insumos do mês |
| Notas de serviços tomados | xml, pdf, zip | Notas de serviços contratados, especialmente com retenção de ISS/INSS/IRRF |
| Cupons fiscais / NFC-e | pdf, zip | Relatório ou arquivos das vendas de varejo do mês |
| Relatório de vendas de cartão (adquirente) | pdf, csv, xlsx | Relatório mensal da Stone/Cielo/Rede/PagSeguro etc. |
| Relatório de marketplace | pdf, csv, xlsx | Extrato de vendas do Mercado Livre/Shopee/Amazon/iFood etc. |

### category = `financial` (mensal) — núcleo do produto

| name | accepted_formats | description |
|------|------------------|-------------|
| Extrato bancário | pdf, ofx | Extrato completo do mês de TODAS as contas PJ (PDF e OFX se possível) |
| Extrato de aplicações financeiras | pdf | Extrato mensal de investimentos/aplicações da empresa |
| Extrato de cartão de crédito PJ | pdf, ofx | Fatura fechada do mês do cartão da empresa |
| Extrato de conta digital / gateway | pdf, csv | Mercado Pago, PagSeguro, Stripe, PayPal etc. |
| Livro caixa | pdf, xlsx, csv | Movimento de entradas e saídas em dinheiro do mês |
| Comprovantes de empréstimos/financiamentos | pdf | Contrato (novo) e comprovantes das parcelas pagas no mês |

### category = `expense` (mensal)

| name | accepted_formats | description |
|------|------------------|-------------|
| Aluguel | pdf | Recibo ou boleto pago do aluguel do mês |
| Contas de consumo | pdf, zip | Energia, água, telefone e internet do mês |
| Recibos de autônomos (RPA) | pdf | Recibos de serviços tomados de pessoas físicas |
| Comprovante de pró-labore | pdf | Comprovante de pagamento do pró-labore dos sócios |
| Outras despesas dedutíveis | pdf, zip | Combustível, viagens, assinaturas de software etc. |

### category = `payroll` (mensal + eventual) ⚠️ pode conter dado sensível LGPD

| name | accepted_formats | description | periodicidade típica |
|------|------------------|-------------|----------------------|
| Variáveis da folha | pdf, xlsx | Horas extras, faltas, comissões, adicionais do mês | monthly, `due_month_offset = 0` |
| Atestados médicos | pdf, jpg, png | Atestados apresentados no mês (dado sensível — sigilo) | monthly, `due_month_offset = 0` |
| Comprovantes de pagamento de salários | pdf, zip | Comprovantes bancários dos salários pagos | monthly |
| Documentos de admissão | pdf, zip | RG, CPF, CTPS digital, ASO admissional, contrato | on_demand |
| Documentos de rescisão | pdf, zip | Aviso prévio, ASO demissional, termo assinado | on_demand |
| Documentos de férias | pdf | Aviso e recibo de férias assinados | on_demand |

### category = `tax` (mensal) — comprovantes de pagamento

| name | accepted_formats | description |
|------|------------------|-------------|
| DAS pago | pdf | Comprovante de pagamento do DAS do mês (`due_day ≈ 25`, `due_month_offset = 1`) |
| DARFs pagos (IRPJ/CSLL/PIS/COFINS) | pdf, zip | Comprovantes dos DARFs pagos no período |
| Guia ICMS / ICMS-ST | pdf | Comprovante da guia estadual paga |
| Guia ISS | pdf | Comprovante do ISS próprio e retido |
| FGTS e INSS (eSocial/DCTFWeb) | pdf, zip | Guia FGTS Digital e DARF do eSocial pagos |
| Parcelamentos | pdf | Comprovantes das parcelas de parcelamentos tributários |

### category = `corporate` (eventual — `on_demand`)

| name | accepted_formats | description |
|------|------------------|-------------|
| Contrato social / alterações | pdf | Contrato social e alterações registradas |
| Cartão CNPJ e inscrições | pdf | CNPJ, inscrição estadual e municipal |
| Certificado digital | pfx, pdf | Arquivo A1 na renovação (tratar com segurança reforçada) |
| Alvarás e licenças | pdf | Alvarás/licenças renovados |
| Notas de ativo imobilizado | pdf, xml | Compra/venda de máquinas, veículos, equipamentos |
| Contratos relevantes | pdf | Locação, leasing, contratos societários novos |

### Anuais (periodicity = `annual`)

| name | accepted_formats | annual_month | description |
|------|------------------|--------------|-------------|
| Informe de rendimentos bancários | pdf | 1 | Informes anuais dos bancos (para ECF/IRPJ) |
| Inventário de estoque | pdf, xlsx | 12 | Contagem de estoque em 31/12 |
| Relatório anual de receitas (MEI) | pdf, xlsx | 12 | Base para a DASN-SIMEI |

## 2. Templates fixos (`checklist_template`, seed do produto)

Flags condicionais (em `company.flags`): `has_employees`, `accepts_card_payments`, `has_inventory`.

| Item (document_type) | Template MEI | Template Simples — Serviços | Template Simples — Comércio | Template Lucro Presumido | Template Lucro Real |
|---|---|---|---|---|---|
| Notas fiscais emitidas | ✅ | ✅ | ✅ | ✅ | ✅ |
| Notas fiscais de entrada | ✅ | — | ✅ | ✅ | ✅ |
| Notas de serviços tomados | — | ✅ | ✅ | ✅ | ✅ |
| Cupons fiscais / NFC-e | — | — | ✅ | ✅ | ✅ |
| Relatório de vendas de cartão | `accepts_card_payments` | `accepts_card_payments` | `accepts_card_payments` | `accepts_card_payments` | `accepts_card_payments` |
| Extrato bancário | ✅ | ✅ | ✅ | ✅ | ✅ |
| Extrato de cartão de crédito PJ | — | ✅ | ✅ | ✅ | ✅ |
| Livro caixa | ✅ | ✅ | ✅ | ✅ | ✅ |
| Aluguel + contas de consumo | — | ✅ | ✅ | ✅ | ✅ |
| Comprovante de pró-labore | — | ✅ | ✅ | ✅ | ✅ |
| Variáveis da folha + atestados | `has_employees` | `has_employees` | `has_employees` | ✅ | ✅ |
| FGTS e INSS pagos | `has_employees` | `has_employees` | `has_employees` | ✅ | ✅ |
| DAS pago | ✅ | ✅ | ✅ | — | — |
| DARFs pagos | — | — | — | ✅ | ✅ |
| Guia ICMS / ISS | — | ISS | ✅ | ✅ | ✅ |
| Inventário de estoque (anual, mês 12) | — | — | `has_inventory` | `has_inventory` | ✅ |
| Relatório anual de receitas (anual, mês 12) | ✅ | — | — | — | — |

Itens `corporate` e os `on_demand` de `payroll` **não** entram em template mensal — chegam como override pontual ou Documento Extra.

## 3. Prazos default sugeridos (validar com design partner — decisão 🔴 #1 do domínio)

| Item | due_day | due_month_offset | Racional |
|------|---------|------------------|----------|
| Extrato bancário / extratos em geral | 5 | 1 | Só existe após fechar o mês |
| Notas fiscais / cupons | 5 | 1 | Exportação do mês fechado |
| DAS pago | 25 | 1 | Vencimento legal ~dia 20–25 |
| FGTS/INSS pagos | 25 | 1 | Vencimento legal ~dia 20 |
| Variáveis da folha / atestados | 25 | 0 | Necessários DENTRO do mês de referência (folha roda ~dia 25) |
| Demais | NULL | 1 | Herdam o prazo da competência |
