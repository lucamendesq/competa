# Endurecimento do Effect — o que trazer do `summer/product-server`

Comparação feita em 2026-10-24 contra `~/github.com/simplifidev/summer/packages/product-server`
(domínios `scholarship-finder` e `authentication`, que são os que usam Effect de fato —
`identity-management` tem 1 de 46 arquivos com Effect e a doc do próprio repo o trata como
superado).

Ponto de partida: o Nest saiu (commit `8131756`). Não há mais nada para compatibilizar, então
as cascas de transição deixam de ter justificativa.

## Ondas

Cada onda é verificada pela suíte de caracterização inteira — ela continua sendo a rede.

### 1. Transação ambiente

Hoje: cada método abre a sua (`d.transaction(...)`, 14 lugares) e **não existe** como compor
dois métodos de repositório numa transação só. Foi por isso que `CompaniesRepo.create` teve de
juntar checagem de teto e insert dentro do mesmo método.

Alvo: `CurrentTransaction` como `Context.Reference` com default vazio, `db.use` rodando no
executor ambiente quando houver, e `db.withTransaction(effect)` decidindo a unidade de trabalho
em quem CHAMA. Drizzle no driver `node-postgres` já faz savepoint em transação aninhada
(`node_modules/drizzle-orm/node-postgres/session.js:70`), então não precisamos do savepoint à
mão que o summer teve de escrever para o Sequelize — e ficamos sem o deadlock que eles
documentaram.

### 2. Fim das cascas

- Apagar os 5 `*.repository.ts` órfãos (zero consumidores).
- Converter os últimos chamadores não-Effect — os dois listeners, os crons e o
  `whatsapp.provider` — e apagar as 4 fachadas que só existiam para eles.
- Migrar `accountant`/`invite`/`user-device` para serviços Effect e matar o `withDb`, que hoje
  devolve `Effect<A>` com canal de erro `never` (erro de banco vira defeito sem querer).

### 3. Um runtime só

Hoje `fromRuntime` faz `Effect → Promise → Effect` em TODA chamada de repositório dentro de
uma rota: apaga o canal de erro (o que sai é `Effect<A, never>`), perde interrupção e cruza
fibra. Estreitar os erros antes disso não serviria de nada — a ponte apagaria os tipos novos
na saída. Alvo: a rota chama o repositório direto, e o `AppLayer` entra uma vez na layer do
servidor via `appServices`.

Consequência aceita: o repositório agora corre na fibra da requisição, então **é
interrompível**. Um abort do cliente no meio de uma transação passa a desfazê-la onde antes
commitava. É o desfecho correto, e é mudança de comportamento — anotada em `STATE.md`.

`run` sobrevive só onde a fronteira com promise é real: listeners do eventemitter2, entradas
de cron e scripts.

### 4. Canal de erro que diz a verdade

Hoje todo método é `Effect<A, DbError>` — um erro que nenhum chamador pode tratar viaja pela
pilha inteira, e a onda 3 ainda teve de declará-lo na união `Failure` da plataforma. Alvo:
erro de infra morre na borda do repositório (`catchTag('DbError', die)`) e a assinatura lista
só erro de domínio, como `Effect<Period, PeriodAlreadyOpen>` — o que apaga o `DbError` de
`platform.ts`, de `middleware/auth.ts` e das anotações de rota.

### 5. `layerTest` ao lado do `layer`

Os 11 arquivos de teste de unidade batem no Postgres real. Um fake no mesmo arquivo do contrato
não desatualiza e tira o banco do caminho onde ele não agrega.

### 6. Resultado como união, não booleano

A terceira categoria de falha do summer: desfecho que o chamador não pode mudar é valor de
sucesso tipado, não `{sent:false}` solto. É exatamente a forma do bug congelado #15.

## O que NÃO trazer

- **Mapa erro→HTTP exaustivo por rota.** Excelente com ~6 rotas e erro rico de domínio; com 97
  rotas e status na classe `AppError`, exigir união declarada por rota é cerimônia. O ganho real
  (saber o que pode falhar) vem da onda 4, de graça.
- **`*.port.ts`.** Interface com uma implementação só. O próprio dialeto Effect deles aboliu.
- **`BaseAggregate` com eventos** que nunca são despachados — a doc deles admite que é
  infraestrutura morta.
- **Remodelar domínio** (VO, agregado como união de estados). É reescrita, não endurecimento.
