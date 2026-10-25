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
erro de infra morre na borda do repositório e a assinatura lista só erro de domínio, como
`Effect<Period, PeriodAlreadyOpen>` — o que apaga o `DbError` de `platform.ts`, de
`middleware/auth.ts` e das anotações de rota.

A borda NÃO é cada método: nenhum deles anotava `DbError` explicitamente (tudo inferido), então
mudar o `Db` basta e as ~100 assinaturas acompanham. O par fica assim:

| Quando                 | Método                                 | Canal     |
| ---------------------- | -------------------------------------- | --------- |
| o normal               | `db.use` / `db.withTransaction`        | morre     |
| vou INSPECIONAR o erro | `db.attempt` / `db.attemptTransaction` | `DbError` |

`attemptTransaction` existe porque o `DbError` do corpo e o da maquinaria (BEGIN/COMMIT caindo)
chegam com a MESMA tag: quem usa `attempt` no corpo e deixasse o `withTransaction` matar
perderia o tratador — é o caso da importação de CSV em `company.repo`, cujo
`ValidationError('Nada foi importado')` cobre as duas origens.

O compilador faz a busca: `catchTag('DbError')` não compila num canal sem `DbError`, então ele
enumera sozinho os sítios que precisam da variante que falha.

### 5. `layerTest` ao lado do `layer`

O `layerTest` do summer NÃO é dublê com dados canned: todo método **morre** ("Every method
dies, so no call returns something its lifted signature doesn't describe"). É trava, não dublê.

Aplicado aqui só no `Db`. Dublê in-memory de repositório, que eles fazem no `throttleState`,
cabe lá porque aquele repositório é um contador — a semântica inteira cabe em memória. Os
nossos são SQL: escopo (`where accounting_firm_id = scope`), joins e detecção de violação de
unicidade. Um dublê deles provaria o dublê, e apagaria a ÚNICA cobertura do isolamento por
Contabilidade (regra dura 2, LGPD). Os 13 specs de repositório continuam no Postgres real.

Ganho concreto: `test/unit/http/server.spec.ts` dizia "sem banco" num comentário e construía o
`AppLayer` inteiro, abrindo pool. Agora usa `AppReposWithoutDb` e a frase virou propriedade
provada — verificada por mutação: uma consulta no caminho da plataforma derruba 2 testes.

### 6. Resultado como união, não booleano

A terceira categoria de falha do summer: desfecho que o chamador não pode mudar é valor de
sucesso tipado, não `{sent:false}` solto. É exatamente a forma do bug congelado #15.

`MessagesRepo.resend` achatava QUATRO desfechos num booleano: entregue, provider recusou, push
sem inscrição, e purpose sem branch (o "silencioso" do #15). Viraram `ResendOutcome`.

O fio NÃO muda — o #15 é congelado e o e2e usa `toEqual({sent: ...})`. Quem achata agora é a
rota, numa linha à vista, em vez de o repositório, em dois `return` escondidos.

## O que NÃO trazer

- **Mapa erro→HTTP exaustivo por rota.** Excelente com ~6 rotas e erro rico de domínio; com 97
  rotas e status na classe `AppError`, exigir união declarada por rota é cerimônia. O ganho real
  (saber o que pode falhar) vem da onda 4, de graça.
- **`*.port.ts`.** Interface com uma implementação só. O próprio dialeto Effect deles aboliu.
- **`BaseAggregate` com eventos** que nunca são despachados — a doc deles admite que é
  infraestrutura morta.
- **Remodelar domínio** (VO, agregado como união de estados). É reescrita, não endurecimento.
