-- Documentos que já existiam antes da coluna `upload_status`: quem tem `uploaded_at`
-- passou pela confirmação do fluxo antigo, então é `uploaded`. Sem isto eles sumiriam da
-- revisão, do zip e do painel — as leituras passaram a exigir `upload_status='uploaded'`.
UPDATE "document" SET "upload_status" = 'uploaded' WHERE "uploaded_at" IS NOT NULL;

-- Autoria retroativa: o Responsável do Link daquela Solicitação é quem enviou.
UPDATE "document" d
SET "uploaded_by_contact_id" = l."contact_id"
FROM "upload_link" l
WHERE l."request_id" = d."request_id" AND d."uploaded_by_contact_id" IS NULL;
