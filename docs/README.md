# Documentação — Coleta de Documentos Contábeis

Documentação viva do projeto. Fonte única de contexto para pessoas e agentes de IA.
Para o resumo operacional (como trabalhar aqui, o que nunca violar), comece pelo [`AGENTS.md`](../AGENTS.md) na raiz.

> Estado (2026-09-11): produto implementado até a Fase 10 (backend + telas + PWA), com deploy em Fly.io/Cloudflare Pages/Supabase e CI ativos. Estes documentos nasceram como intenção de design; hoje descrevem o sistema real. Atualize-os na mesma mudança que altera o código.

## Índice

| Documento                                      | Conteúdo                                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [`product.md`](./product.md)                   | Propósito, público, atores, marca, contexto de mercado (digest do discovery)                                      |
| [`architecture.md`](./architecture.md)         | Monorepo pnpm workspaces, `apps/web` (Angular) + `apps/api` (NestJS), componentes, integrações, diagrama          |
| [`domain.md`](./domain.md)                     | Subdomínios, bounded contexts + invariantes, jornada principal, **glossário PT↔EN normativo**, eventos de domínio |
| [`conventions.md`](./conventions.md)           | Nomenclatura, padrões de código/API/testes, variáveis de ambiente, git e **anti-patterns**                        |
| [`database-schema.md`](./database-schema.md)   | **Fonte canônica** do banco — DDL completa (Postgres/Drizzle), algoritmos e transições de estado                  |
| [`document-catalog.md`](./document-catalog.md) | Seed do produto: tipos de documento e 5 templates fixos de checklist                                              |
| [`decisions.md`](./decisions.md)               | Registro de decisões arquiteturais (ADR-001…011) com racional e alternativas                                      |
| [`roadmap.md`](./roadmap.md)                   | Backlog v1 em fatias finas (TASK-001…055), fases, adiamentos com gatilho e marcos de validação                    |
| [`deploy.md`](./deploy.md)                     | Runbook de deploy: Supabase (session pooler) + Fly.io + Cloudflare Pages, secrets                                 |
| [`backup.md`](./backup.md)                     | Backup diário do Postgres (GH Actions → R2 dedicado), RPO/RTO, restore e inventário de segredos                   |
| [`retention.md`](./retention.md)               | Política de retenção/expurgo por tipo de dado + runbook manual de cancelamento                                    |
| [`frontend-status.md`](./frontend-status.md)   | Telas do `apps/web`: o que existe, o que ficou degradado por falta de rota e o que precisa de configuração        |
| [`next-steps.md`](./next-steps.md)             | O que falta para "completo": produto, deploy/CI, observabilidade, LGPD operacional e backup                       |

## Como manter

- `database-schema.md` é **canônico**: o schema Drizzle (`apps/api/src/infra/database/schema/`) deve espelhá-lo; divergência exige atualizar o doc na mesma PR.
- O glossário PT↔EN em `domain.md` é **normativo**: termo em inglês fora do mapa é bug de linguagem.
- `decisions.md` registra o "porquê". Ao reverter/superar uma decisão, adicione uma nova entrada em vez de reescrever a antiga.
- `conventions.md` deve crescer quando um padrão novo se firmar ou um anti-pattern aparecer.
