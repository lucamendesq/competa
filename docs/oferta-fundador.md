# Runbook — Oferta Fundador

Desconto vitalício para os **10 primeiros escritórios pagantes**, decidido na
[D18 §6](./decisions.md#d18--recalibragem-de-planos-pela-carteira-real-e-segundo-eixo-de-upgrade).
Não tem tela: dez clientes não pagam um CRUD. É SQL, com este runbook do lado.

| Plano        | Público | Fundador (vitalício) |
| ------------ | ------- | -------------------- |
| Essencial    | R$ 119  | **R$ 89**            |
| Profissional | R$ 189  | **R$ 139**           |
| Escritório   | R$ 299  | **R$ 219**           |

No anual vale a mesma regra do preço público: **10× o mensal** (2 meses grátis). Os valores
canônicos estão em `FOUNDER_PRICE_OVERRIDE`, em
[`libs/contracts/src/plan.ts`](../libs/contracts/src/plan.ts) — se divergirem do SQL abaixo,
o `plan.ts` é que vale.

## Antes de ativar

1. **Contrapartida acordada por escrito**: depoimento gravado **+** estudo de caso com número
   medido (ex.: taxa de entrega sem ligação, antes e depois). Sem isso o desconto é só
   desconto.
2. **Conferir as vagas** (o limite é 10; passar sem perceber é o jeito fácil de queimar a
   oferta):

   ```sql
   select count(*) as fundadores_ativos
   from subscription
   where price_override is not null;
   ```

3. **O override tem que entrar ANTES do checkout.** `billing.controller` lê
   `subscription.price_override` no momento de criar a assinatura no Asaas. Mudar o valor no
   banco **não** altera uma assinatura já criada no gateway — se o escritório já assinou, o
   caminho é cancelar a assinatura no painel do Asaas e refazer o checkout, ou atualizar o
   `value` da assinatura pela API do Asaas (`PUT /v3/subscriptions/{id}`).

## Aplicar

```sql
update subscription
set price_override = '{"essencial": 89, "profissional": 139, "escritorio": 219}'::jsonb,
    price_override_reason = 'fundador-2026'
where accounting_firm_id = (
  select id from accounting_firm where name = '<NOME DO ESCRITÓRIO>'
)
returning accounting_firm_id, plan_name, price_override;
```

O override é um **mapa por plano**, não um número solto: o fundador que sobe de tier continua
fundador, sem passo manual.

## Verificar

1. **No produto:** a tela `/configuracoes/plano` do escritório mostra o preço de fundador com
   o rótulo "Preço de fundador, vitalício" e o preço público entre parênteses.
2. **No Asaas** (depois de o escritório concluir o checkout): painel → Assinaturas → conferir
   que o `value` da assinatura é o de fundador, e não o público. Esta conferência é
   obrigatória — é o único lugar onde o dinheiro realmente sai.
3. **No banco:**

   ```sql
   select f.name, s.plan_name, s.cycle, s.status,
          s.price_override, s.price_override_reason, s.gateway_subscription_id
   from subscription s
   join accounting_firm f on f.id = s.accounting_firm_id
   where s.price_override is not null
   order by s.created_at;
   ```

## Remover

Só em caso de erro de aplicação — a oferta é **vitalícia** e tirá-la de um cliente que
cumpriu a contrapartida é quebra de acordo.

```sql
update subscription
set price_override = null, price_override_reason = null
where accounting_firm_id = '<UUID>';
```

Depois disso, a assinatura no Asaas continua no valor antigo até ser atualizada por lá.
