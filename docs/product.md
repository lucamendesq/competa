# Produto — Coleta de Documentos Contábeis

## Em uma frase

SaaS que elimina o garimpo manual de documentos contábeis: a Contabilidade define o checklist mensal de cada Empresa (template + overrides), **"abre a competência"** e o sistema cobra por email/WhatsApp/push, recebe os arquivos (link sem senha no navegador ou App), acompanha pendências no painel "quem faltou" e entrega tudo organizado em zip por empresa/competência.

## Público e posicionamento

- **Público:** escritórios contábeis pequenos (1–5 pessoas) que acham as suítes (Acessórias/Onvio/Nibo) caras e pesadas.
- **Posicionamento:** ferramenta **focada e barata, com preço público** — não uma suíte. **WhatsApp-first** (critério de troca citado por contadores). Faixa de preço plausível: **R$97–197/mês por escritório** (🟡 validar).
- **Time:** dev solo.

## Atores

| Ator | Quem é | O que faz |
|------|--------|-----------|
| **Contador** | Usuário da Contabilidade (v1: único por tenant) | Cadastra Empresas, escolhe/deriva templates, aplica overrides, abre/encerra competências, revisa documentos (em lote por item), baixa zips |
| **Responsável** | Pessoa de contato da Empresa | Recebe o link por email/WhatsApp, envia documentos pelo navegador (sem senha) ou pelo App (com cadastro) |
| WhatsApp Cloud API (Meta) | Sistema externo | Entrega links e lembretes |
| Provedor de email (SES/Resend) | Sistema externo | Entrega links, lembretes e reenvios (canal que nunca bloqueia o fluxo) |
| FCM | Sistema externo (push) | Notifica Responsáveis cadastrados no App |
| Cloudflare R2 | Sistema externo | Armazena documentos e zips (upload direto por URL pré-assinada) |
| Better Auth | Biblioteca (self-hosted na API) | Autenticação do Contador e do Responsável cadastrado |

## Jornada principal (Ciclo da Competência)

```
[Contador] cadastra Empresas (template + overrides + flags)
    → "Abrir Competência" → fan-out: 1 Solicitação por Empresa ativa (com email)
      (checklist efetivo → snapshot de Itens com due_date congelado)
    → [messaging] envia Link de Upload (email + WhatsApp; push se tem App)
    → [Responsável] sobe Documentos (multi-arquivo ou zip; navegador sem senha OU App)
    → [Contador] revisa EM LOTE: aceita Item | rejeita (reabre Item + reenvia link SÓ por email)
    → [Sistema] lembretes agrupados de pendência (máx. 2); prazo por item estourado → notifica ambos
    → todos aceitos = RequestCompleted → [Contador] Encerra (palavra final; pode com pendências)
    → [Contador] baixa Zip (empresa/competência ou competência inteira)
```

Detalhes: linha do tempo de eventos em [`domain.md`](./domain.md); algoritmo de fan-out em [`database-schema.md`](./database-schema.md).

## Nome e marca

- **Nome:** provisório — "Coleta de Documentos Contábeis" (codinome do repo: `contabilidade`). Nome de produto {a definir}.
- **Shortlist (domínios .com.br livres em 2026-08-26):**
  - **Competa** (`competa.com.br`) — de "competência" (o conceito central *abrir a competência*); ecoa "completa".
  - **Coletera** (`coletera.com.br`) — de "coleta"; brandável, estilo Nibo/Qive.
- Pendente: verificação de marca no INPI antes da decisão final.

## Contexto de mercado (digest do discovery)

Veredito do discovery (2026-08-26): **✅ GO condicionado** ao recorte **web-first, WhatsApp-first, preço público e barato** — não à versão com app mobile na v1 e posicionamento genérico. Nota 29/40.

- **A dor virou categoria.** Concorrentes BR (Acessórias 8.500+, Nibo 15.000+, Gestta/Onvio da Thomson Reuters, Omie G-Click) e globais (Content Snare, TaxDome 10.000+, Financial Cents) vivem dela. Dois patamares de preço comprovados: especializadas US$35–215/mês por firma; suítes US$50–150/user/mês.
- **Gaps reais explorados pelo produto:** preço 100% opaco no BR (única âncora pública: G-Click R$100/mês), produtos pesados, **link sem senha raro**, **zip por cliente/mês inexistente** nos anúncios.
- **Alerta Qive:** NF-e tende a ser resolvida por captura automática na SEFAZ. O valor durável está nos documentos **não estruturados** (extratos, folha, recibos) — por isso o modelo é agnóstico ao tipo de arquivo (sem parsing de XML na v1).
- **Alerta FileInvite:** o único especializado que tentou viver só de coleta no nicho contábil abandonou o segmento — sinal de teto de preço para ferramenta avulsa.
- **Regulatório:** nenhum bloqueio. O SaaS opera como **operador LGPD** (obrigações leves, responsabilidade solidária). Sem licença/registro CFC. Tratar storage como se pudesse conter dado sensível (folha revela sensível por inferência: sindicato, atestados). Link sem senha aceitável com expiração curta + escopo só-upload + vínculo a email/telefone.
- **Custo operacional estimado:** ~R$465–480/mês para 50 escritórios (~10% da receita a R$99/escritório); dominado por WhatsApp (~R$0,045/msg).

### Hipóteses mais arriscadas (validar antes do produto completo)

1. 🔴 Contadores pagam por uma ferramenta **avulsa** de coleta em vez de uma suíte? → landing com preço público + 10 conversas; meta: 3 cartões/cartas de intenção.
2. 🔴 O **link sem senha** realmente aumenta a taxa de entrega? → concierge de 1 mês com o contador design-partner (5–10 clientes); medir entrega sem ligação vs. mês anterior.
3. 🟡 Dev solo consegue os primeiros 10 escritórios pagantes sem força de vendas? → 30 dias de outreach (indicação + fórum Contábeis + conteúdo); meta 10 demos.

> Priorize chegar ao fluxo central ponta-a-ponta (ver marco "Após TASK-024" em [`roadmap.md`](./roadmap.md)) — é onde o concierge do discovery pode rodar — antes de construir as fases posteriores.

## Roadmap

Backlog v1 em fatias verticais finas (esqueleto ambulante), fases 0–9 e marcos de validação: [`roadmap.md`](./roadmap.md).
