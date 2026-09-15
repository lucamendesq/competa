# Produto — Competa

<!-- impeccable:product-schema 1 -->

## Platform

web

O "App" do Responsável é a **PWA** entregue na Fase 10 (Angular + service worker, push FCM,
passkey) — não há app nativo. A Fase 9 (decidir por app nativo) segue **em aberto**; enquanto
estiver, a linguagem visual é uma só, web, sem divergir por sistema operacional.

## Em uma frase

SaaS que elimina o garimpo manual de documentos contábeis: a Contabilidade define o checklist mensal de cada Empresa (template + overrides), **"abre a competência"** e o sistema cobra por email/WhatsApp/push, recebe os arquivos (link sem senha no navegador ou App), acompanha pendências no painel "quem faltou" e entrega tudo organizado em zip por empresa/competência.

## Público e posicionamento

- **Público:** escritórios contábeis pequenos (1–5 pessoas) que acham as suítes (Acessórias/Onvio/Nibo) caras e pesadas.
- **Posicionamento:** ferramenta **focada e barata, com preço público** — não uma suíte. **WhatsApp-first** (critério de troca citado por contadores). Faixa de preço plausível: **R$59–197/mês por escritório**, em tiers (🟡 validar no discovery antes da TASK-049):

  | Plano        | Preço/mês  | Empresas ativas | WhatsApp incluso            |
  | ------------ | ---------- | ---------------- | ----------------------------- |
  | Trial        | grátis 14d | até 10            | incluído                       |
  | Essencial    | R$59–79    | até 15–20         | add-on / pré-pago              |
  | Profissional (âncora) | R$99–147 | até 40–50 | franquia (100–800 msgs) + overage |
  | Escritório   | R$169–197  | até 80–100        | franquia maior (300–1.600 msgs) + overage |

  Métrica de cobrança: **empresas ativas em competência aberta por mês** (não por usuário, não por
  GB) — é o que a "Cobrança/assinatura" (ainda 🔴, sem nenhuma linha de código — ver
  [`next-steps.md`](./next-steps.md#1-lacunas-de-produto)) deve instrumentar quando for desenhada.
- **Time:** dev solo.

## Atores

| Ator                           | Quem é                                                                 | O que faz                                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Contador**                   | Usuário da Contabilidade (N Contadores por Contabilidade, via convite) | Cadastra Empresas, escolhe/deriva templates, aplica overrides, abre/encerra competências, revisa documentos (em lote por item), baixa zips |
| **Responsável**                | Pessoa de contato da Empresa                                           | Recebe o link por email/WhatsApp, envia documentos pelo navegador (sem senha) ou pelo App (com cadastro)                                   |
| WhatsApp Cloud API (Meta)      | Sistema externo                                                        | Entrega links e lembretes                                                                                                                  |
| Provedor de email (SES/Resend) | Sistema externo                                                        | Entrega links, lembretes e reenvios (canal que nunca bloqueia o fluxo)                                                                     |
| FCM                            | Sistema externo (push)                                                 | Notifica Responsáveis cadastrados no App                                                                                                   |
| Cloudflare R2                  | Sistema externo                                                        | Armazena documentos e zips (upload direto por URL pré-assinada)                                                                            |
| Better Auth                    | Biblioteca (self-hosted na API)                                        | Autenticação do Contador e do Responsável cadastrado                                                                                       |

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

- **Nome decidido:** **Competa** — de "competência", o conceito central do produto (_abrir a
  competência_); ecoa "completa". Domínio `competa.com.br` livre em 2026-08-26.
- Codinome do repositório: `contabilidade`.
- Pendente: verificação de marca no INPI.
- **Voz:** português do Brasil, direta e sem jargão de software. A interface fala a língua do
  escritório: Competência, Solicitação, Item, Responsável, Contabilidade.

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

## Princípios de produto

1. **O Responsável nunca precisa de conta.** Conta é oferta, nunca mecanismo — o Link de
   Upload sozinho tem de bastar para enviar documento (D14).
2. **Construir com a rota que existe.** Tela degradada e sinalizada vale mais que endpoint
   inventado; cada lacuna é visível na própria interface (ver `frontend-status.md`).
3. **Foco, não suíte.** O produto ganha por ser barato, previsível e estreito — cada
   funcionalidade nova precisa caber no ciclo da Competência.
4. **Agnóstico ao tipo de arquivo.** O valor durável está no documento não estruturado; sem
   parsing fiscal na v1.
5. **Estado nunca é só cor.** Painel denso, escritório apressado: status pede ícone + texto.

## Acessibilidade e inclusão

- Padrão exigido: **WCAG AA**. Contraste mínimo 4.5:1 para texto pequeno (as pílulas de
  status têm 11px) e 3:1 para ícone decorativo maior.
- Todo controle com nome acessível, todo campo com `label`, um `h1` por página, sem salto de
  nível de heading, sem `id` duplicado.
- Status nunca comunicado só por cor.
- A página pública de envio (`/envio/:token`) é **mobile-first**: chega por WhatsApp/email e é
  aberta no celular do Responsável, muitas vezes fora do escritório.

## Evidências disponíveis

- Discovery de mercado de 2026-08-26 com concorrentes, faixas de preço e alertas
  (seção "Contexto de mercado" acima) — a única âncora de preço pública é G-Click R$100/mês.
- Produto real rodando: API NestJS (`apps/api`) e web Angular (`apps/web`), fases 0–10,
  estado tela a tela em [`frontend-status.md`](./frontend-status.md).
- Decisões registradas em [`decisions.md`](./decisions.md); domínio em [`domain.md`](./domain.md).
- **Não existe ainda** (não inventar): cliente pagante, depoimento, estudo de caso, logotipo,
  identidade visual definida, número de uso, imprensa, preço validado. A faixa R$97–197/mês
  segue sendo hipótese.
