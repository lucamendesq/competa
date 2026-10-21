# Métricas de plano — os dois eixos disparam?

A [D18](./decisions.md#d18--recalibragem-de-planos-pela-carteira-real-e-segundo-eixo-de-upgrade)
aposta em dois eixos de upgrade: **volume** (teto de Empresas ativas) e **capability** (marca,
cadência de lembretes, zip da competência). Sem medir, daqui a seis meses a conversa sobre preço
vai ser a de hoje: opinião contra opinião.

Sem dashboard de propósito. São quatro consultas, rodadas na mão contra o Postgres (`psql` ou
`pnpm --filter api db:studio`). Cada uma existe para informar **uma** decisão.

## Gatilho de revisão do segundo eixo

> Com **20 pagantes e 3 meses de uso**: se nenhum gate tiver sido batido por pelo menos **3
> firms distintas**, a recomendação padrão é **remover os três gates** e voltar ao eixo único —
> mantendo os preços, porque eles foram calibrados pela carteira (Fenacon/Sescon-SP), não pelos
> gates.
>
> Remover é mais barato que defender. Três `if`s a menos e uma tabela de preços mais simples
> valem mais que um eixo que ninguém usa.

A consulta 2 é a que responde isso.

---

## 1. Ocupação de teto por firm

**Decide:** o eixo de volume vai disparar, ou todo mundo parou na metade do plano? Se a massa
estiver abaixo de 50%, o teto nunca vai gerar upgrade e o preço está ancorado no lugar errado.

```sql
with uso as (
  select f.id,
         f.name,
         s.plan_name,
         count(c.id) filter (where c.active) as ativas,
         case s.plan_name
           when 'trial'        then 15
           when 'essencial'    then 30
           when 'profissional' then 80
           when 'escritorio'   then 200
         end as teto
  from accounting_firm f
  join subscription s on s.accounting_firm_id = f.id
  left join company c on c.accounting_firm_id = f.id
  group by f.id, f.name, s.plan_name
)
select name,
       plan_name,
       ativas,
       teto,
       round(100.0 * ativas / nullif(teto, 0)) as pct,
       case
         when ativas > teto        then 'excedente'
         when ativas >= 0.8 * teto then '80-100%'
         when ativas >= 0.5 * teto then '50-80%'
         else '<50%'
       end as faixa
from uso
order by pct desc nulls last;
```

Os tetos estão repetidos aqui porque SQL não importa TypeScript — a fonte canônica continua
sendo [`libs/contracts/src/plan.ts`](../libs/contracts/src/plan.ts). Mudou o teto lá, atualize o
`case` aqui.

## 2. Gates batidos por firm/mês

**Decide:** alguém quer a marca, a cadência ou o zip da competência o suficiente para esbarrar
neles? É a consulta do gatilho de revisão acima.

Não há tabela: a fonte é o **log da aplicação**. O `PlanGuard`
(`apps/api/src/modules/auth/plan.guard.ts`) emite uma linha por negação, com firm, capability,
plano e rota:

```
402 PLAN_CAPABILITY_REQUIRED firm=<uuid> capability=periodZip plan=essencial route=GET /periods/:id/zip
```

A mesma linha vai para o Sentry como `warning`. Duas formas de contar:

```bash
# Fly.io — últimos 30 dias, firms distintas por capability
fly logs -a competa-api | grep PLAN_CAPABILITY_REQUIRED \
  | sed -E 's/.*firm=([^ ]+) capability=([^ ]+).*/\2 \1/' \
  | sort -u | awk '{ c[$1]++ } END { for (k in c) print k, c[k] " firms distintas" }'
```

No Sentry: busca por `PLAN_CAPABILITY_REQUIRED`, agrupando por mensagem. O número que importa é
**firms distintas por capability**, não total de eventos — uma firm teimosa clicando dez vezes
no mesmo botão não é demanda de mercado.

| Capability       | Firms distintas em 3 meses | Veredito      |
| ---------------- | -------------------------- | ------------- |
| `branding`       | ?                          | manter se ≥ 3 |
| `reminderTuning` | ?                          | manter se ≥ 3 |
| `periodZip`      | ?                          | manter se ≥ 3 |

## 3. Upgrades, com o motivo

**Decide:** qual eixo está realmente vendendo. Separa quem subiu por teto (banner de excedente,
COM-179) de quem subiu depois de bater um 402 de capability.

O banco guarda o plano atual, não o histórico, então o motivo sai do cruzamento com os logs:

```sql
select f.name,
       s.plan_name,
       s.cycle,
       s.status,
       s.current_period_start as ativou_em,
       (select count(*) filter (where c.active)
          from company c where c.accounting_firm_id = f.id) as ativas_hoje
from subscription s
join accounting_firm f on f.id = s.accounting_firm_id
where s.plan_name <> 'trial'
order by s.current_period_start desc nulls last;
```

Para cada linha, procure no log da semana anterior a `ativou_em`:

- linha de `PLAN_CAPABILITY_REQUIRED` daquela firm → **upgrade por capability**;
- firm com `ativas_hoje` próxima do teto do plano antigo → **upgrade por teto**;
- nenhum dos dois → upgrade por decisão comercial (conversa, demo). Vale anotar à parte: é o
  sinal de que o preço vende sozinho e nenhum dos eixos precisou agir.

## 4. Tempo até o primeiro estouro de teto, por cohort

**Decide:** quanto tempo leva para o eixo de volume agir. Se a resposta for "mais de 12 meses",
o teto não é um motor de receita, é só uma trava — e o preço precisa estar certo na entrada.

```sql
select date_trunc('month', s.created_at) as cohort,
       count(*) as firms,
       count(*) filter (
         where (select count(*) filter (where c.active)
                  from company c where c.accounting_firm_id = s.accounting_firm_id)
               > case s.plan_name
                   when 'trial'        then 15
                   when 'essencial'    then 30
                   when 'profissional' then 80
                   when 'escritorio'   then 200
                 end
       ) as ja_estouraram,
       round(avg(extract(epoch from (now() - s.created_at)) / 86400)) as dias_de_vida_medios
from subscription s
group by cohort
order by cohort;
```

Com histórico de verdade (quando houver), troque `now()` pela data do primeiro estouro. Hoje a
coluna não existe e não vale criar uma tabela de eventos para medir zero pagante — se esta
consulta começar a doer, aí sim.

## Rodar contra o banco de dev

```bash
pnpm --filter api db:seed          # catálogo de documentos
pnpm --filter api create-firm      # uma Contabilidade com convite
pnpm --filter api check:plan-cap   # exercita teto, folga e importação inativa
pnpm --filter api check:plan-gates # exercita os três gates e o log de negação
```

Com o seed, as consultas 1 e 4 devolvem linhas; a 2 depende de alguém bater num gate — o
`check:plan-gates` imprime a linha de negação no console, no mesmo formato do log de produção.
