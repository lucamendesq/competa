# Retenção e expurgo

> Política definida em 2026-09-11. O job automático de expurgo fica **adiado até o
> primeiro cancelamento real** (decisão registrada no roadmap): automatizar delete sem
> caso real é onde se apaga dado errado. Até lá, vale o runbook manual abaixo.

## Prazos

| Dado                                                      | Prazo                                          | Racional                                        |
| --------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| Documentos fiscais (objetos no R2 + linhas em `document`) | **5 anos** a partir do upload                  | prazo geral de guarda fiscal (art. 173/174 CTN) |
| Dados cadastrais (`company`, `contact`)                   | enquanto a Contabilidade for cliente + 90 dias | operação do serviço                             |
| Contabilidade cancelada                                   | **90 dias** de retenção total, depois expurgo  | janela de arrependimento/exportação             |
| Mensagens (`message`) e logs                              | 1 ano                                          | trilha operacional                              |
| Backups do Postgres                                       | 7 diários / 4 semanais / 12 mensais            | [`backup.md`](./backup.md)                      |

No cancelamento, a Contabilidade pode pedir a exportação (zip por Competência já existe
por tela; dump por firm sob demanda).

## Runbook de expurgo (manual, por Contabilidade cancelada)

Após os 90 dias:

```sql
-- conferir o alvo ANTES: nome + contagens
select name from accounting_firm where id = :firm_id;
select count(*) from document d
  join request r on r.id = d.request_id
  join period p on p.id = r.period_id
  where p.accounting_firm_id = :firm_id;
```

```sh
# 1. objetos do R2 (as chaves são prefixadas por firm)
aws s3 rm "s3://$R2_BUCKET/firm/$FIRM_ID/" --recursive --endpoint-url "$R2_ENDPOINT"
```

```sql
-- 2. Postgres: o grosso cai por cascade a partir da firm
-- (document/request_item NÃO têm cascade de request: apagar na ordem)
begin;
delete from document d using request r, period p
  where d.request_id = r.id and r.period_id = p.id and p.accounting_firm_id = :firm_id;
delete from request r using period p
  where r.period_id = p.id and p.accounting_firm_id = :firm_id;
delete from period where accounting_firm_id = :firm_id;
delete from accounting_firm where id = :firm_id; -- cascade: accountant, company, contact, invite…
commit;
```

```sql
-- 3. users órfãos (contatos/contadores da firm que não existem mais em nenhum vínculo)
delete from "user" u
  where not exists (select 1 from accountant a where a.auth_user_id = u.id)
    and not exists (select 1 from contact c where c.auth_user_id = u.id);
```

Anotar a execução (data, firm, quem rodou) neste arquivo.

## Gatilho para automatizar

Primeiro cancelamento real → transformar o runbook em job (cron mensal) com dry-run
logado e réplica do R2 ligada antes ([`backup.md`](./backup.md)).
