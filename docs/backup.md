# Backup e recuperação

> Decidido em 2026-09-11. RPO **24h** (dump diário) / RTO **~1h** (restore manual).
> PITR da Supabase (add-on pago) fica de fora por ora: o dump diário é o RPO aceito do MVP.
> Reavaliar quando houver receita/SLA.

## Postgres

- **O que roda:** [`.github/workflows/backup.yml`](../.github/workflows/backup.yml) — cron
  diário (02:30 BRT) + `workflow_dispatch`. `pg_dump -Fc` contra o session pooler da
  Supabase, enviado para o bucket R2 **`competa-backups`** (dedicado; credencial própria,
  write-only, separada da do bucket de documentos).
- **Retenção 7d/4w/12m via prefixo + lifecycle do bucket:**
  - `daily/` → lifecycle apaga com 8 dias
  - `weekly/` (dumps de domingo) → 35 dias
  - `monthly/` (dia 1º) → 400 dias
- **Secrets do repositório:** `BACKUP_DATABASE_URL` (role read-only de preferência),
  `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY`, `BACKUP_R2_ENDPOINT`
  (`https://<account>.r2.cloudflarestorage.com`).
- **Setup único (fazer 1x):** criar o bucket `competa-backups`, o token S3 write-only e as
  3 regras de lifecycle acima no painel da Cloudflare; cadastrar os 4 secrets no GitHub.

## Restore (runbook)

```sh
aws s3 cp s3://competa-backups/daily/competa-YYYYMMDD.dump . --endpoint-url $R2_ENDPOINT
createdb competa_restore
pg_restore -d competa_restore --no-owner --no-privileges competa-YYYYMMDD.dump
# conferir: contagem de linhas nas tabelas grandes + login de um contador de teste
```

**Teste trimestral de restore** (backup nunca restaurado não é backup): rodar o runbook num
banco descartável e anotar aqui.

| Data | Dump usado | Resultado                                      | Quem |
| ---- | ---------- | ---------------------------------------------- | ---- |
| —    | —          | pendente (primeiro teste após o primeiro dump) | —    |

## R2 (documentos)

- O R2 **não tem versionamento de objeto**. Mitigação real hoje: as chaves são UUID
  imutáveis (`firm/{id}/period/…/{documentId}`), o app **nunca sobrescreve** objeto e não
  há delete em produção — o risco residual é perda do bucket/conta.
- Réplica (`rclone sync` para outro provedor) fica **adiada até existir expurgo**: sem
  delete, o sync só duplicaria custo. Reabrir quando o job de expurgo de
  [`retention.md`](./retention.md) existir — aí a réplica protege contra delete errado.
- Postgres e R2 precisam ser restauráveis para o mesmo instante: `document.storage_key`
  sem o objeto é zip que não abre (o download já falha com 503 antes do primeiro byte,
  mas o documento está perdido). O dump diário + imutabilidade das chaves cobre isso.

## Segredos (inventário)

Cofre dedicado (Vault/Doppler) é overkill para 2 operadores; o par Fly secrets + GitHub
secrets é o cofre. O que existe e onde:

| Segredo                                 | Onde vive      | Se perder                                                 |
| --------------------------------------- | -------------- | --------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                    | Fly secrets    | invalida toda sessão E os tokens de recuperação assinados |
| `DB_PASS` / `BACKUP_DATABASE_URL`       | Fly / GitHub   | rotacionar na Supabase                                    |
| Chaves R2 (documentos)                  | Fly secrets    | rotacionar na Cloudflare                                  |
| Chaves R2 (backup, write-only)          | GitHub secrets | rotacionar na Cloudflare                                  |
| `RESEND_API_KEY`                        | Fly secrets    | rotacionar na Resend                                      |
| Par VAPID                               | Fly secrets    | perder a privada mata TODAS as inscrições de push         |
| `DB_SSL_CA`                             | Fly secrets    | rebaixar do dashboard da Supabase                         |
| `FLY_API_TOKEN`, `CLOUDFLARE_API_TOKEN` | GitHub secrets | rotacionar nos provedores                                 |

Regra: valor de produção nunca entra no repo nem no `.env` de dev.
