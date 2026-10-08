/* Ciclo de vida completo recusa → reenvio → novo aceite, e a exclusão do recusado do zip
 * (COM-152). Não simula nada do caminho crítico: presign, gravação no storage, confirmação,
 * recusa, rotação do link, reenvio e aceite passam pelos repositórios e pelo storage de
 * verdade (LocalStorage em dev). A fixture é criada e apagada aqui. */
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db } from '../infra/database/index.js';
import { LocalStorage } from '../infra/storage/local.storage.js';
import {
  accountant,
  accountingFirm,
  company,
  contact,
  document,
  period,
  request,
  requestItem,
  uploadLink,
  user,
} from '../infra/database/schema/index.js';
import { DocumentRepository } from '../modules/requests/document.repository.js';
import { RequestRepository } from '../modules/requests/request.repository.js';
import { PeriodRepository } from '../modules/periods/period.repository.js';
import { ChecklistRepository } from '../modules/checklists/checklist.repository.js';
import { toFirmScope, toUploadScope } from '../modules/auth/scope.js';
import { zipEntries } from '../modules/requests/zip.js';
import { createToken } from '../lib/token.js';
import { addDays } from 'date-fns';

/* PDF mínimo válido: o `confirm()` lê os primeiros bytes e recusa arquivo cujo conteúdo
 * não bate com a extensão declarada. */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'latin1',
);

const storage = new LocalStorage();

async function uploadOne(
  documents: DocumentRepository,
  scope: ReturnType<typeof toUploadScope>,
  requestItemId: string,
  fileName: string,
) {
  const presigned = await documents.presign(scope, {
    requestItemId,
    files: [{ fileName, contentType: 'application/pdf', sizeBytes: PDF.byteLength }],
  });

  const [file] = presigned.files;
  assert.ok(file.accepted, `presign recusou ${fileName}: ${file.reason}`);

  const url = new URL(file.uploadUrl!);
  await storage.write({
    storageKey: decodeURIComponent(url.pathname.replace('/storage/local/', '')),
    expiresAt: Number(url.searchParams.get('expiresAt')),
    sizeBytes: Number(url.searchParams.get('sizeBytes')),
    signature: url.searchParams.get('signature')!,
    body: Readable.from(PDF),
  });

  const result = await documents.confirm(scope, [file.documentId!]);
  assert.equal(
    result.confirmed,
    1,
    `confirmação recusou ${fileName}: ${result.refused.map((row) => row.reason).join('; ')}`,
  );

  return file.documentId!;
}

async function run() {
  console.log('--- COM-152: recusa → reenvio → novo aceite, e exclusão do zip ---\n');

  const firmId = uuidv7();
  const authUserId = uuidv7();
  const accountantId = uuidv7();
  const companyId = uuidv7();
  const contactId = uuidv7();
  const periodId = uuidv7();
  const requestId = uuidv7();
  const itemId = uuidv7();
  const referenceMonth = '2026-01-01';

  await db.insert(accountingFirm).values({ id: firmId, name: 'Contabilidade COM-152' });
  await db.insert(user).values({
    id: authUserId,
    name: 'Dona',
    email: `dona-${firmId}@test.com`,
    emailVerified: true,
  });
  await db
    .insert(accountant)
    .values({ id: accountantId, authUserId, accountingFirmId: firmId, owner: true });
  await db
    .insert(company)
    .values({ id: companyId, accountingFirmId: firmId, name: 'Empresa COM-152' });
  await db.insert(contact).values({
    id: contactId,
    companyId,
    name: 'Responsável',
    email: `resp-${firmId}@test.com`,
  });
  await db
    .insert(period)
    .values({ id: periodId, accountingFirmId: firmId, referenceMonth, status: 'open' });
  await db.insert(request).values({ id: requestId, periodId, companyId, status: 'open' });
  await db.insert(requestItem).values({
    id: itemId,
    requestId,
    name: 'Extrato bancário',
    acceptedFormats: ['pdf'],
    status: 'pending',
    required: true,
  });
  const firstLink = createToken();
  await db.insert(uploadLink).values({
    id: uuidv7(),
    requestId,
    contactId,
    tokenHash: firstLink.tokenHash,
    expiresAt: addDays(new Date(), 30),
  });

  const firmScope = toFirmScope(firmId);
  const uploadScope = toUploadScope(requestId, contactId);
  const documents = new DocumentRepository(db, storage);
  const requests = new RequestRepository(db);
  const periods = new PeriodRepository(db, new ChecklistRepository(db));

  const itemStatus = async () => {
    const [row] = await db
      .select({ status: requestItem.status })
      .from(requestItem)
      .where(eq(requestItem.id, itemId));
    return row.status;
  };
  const requestStatus = async () => {
    const [row] = await db
      .select({ status: request.status })
      .from(request)
      .where(eq(request.id, requestId));
    return row.status;
  };
  const zipFileNames = async () => {
    const found = await requests.documentsForRequestZip(firmScope, requestId);
    return zipEntries(found!.documents, false).map((entry) => entry.path);
  };
  const panelItem = async () => {
    const rows = await periods.pendingPanel(firmScope, periodId);
    return rows[0]?.missing.find((row) => row.id === itemId);
  };

  try {
    console.log('1. Envio inicial');
    const firstDocumentId = await uploadOne(documents, uploadScope, itemId, 'extrato.pdf');
    assert.equal(await itemStatus(), 'submitted');
    console.log('  ✓ presign + gravação + confirmação → Item em `submitted`');
    assert.deepEqual(
      await zipFileNames(),
      ['Extrato bancário/extrato.pdf'],
      'coleta aberta entrega o que chegou, mesmo sem conferência',
    );
    console.log('  ✓ zip já entrega o pendente: coleta aberta é pacote de trabalho');

    console.log('\n2. Recusa');
    const rejected = await requests.rejectDocument(
      firmScope,
      firstDocumentId,
      'Extrato ilegível, reenvie em PDF nítido.',
      accountantId,
    );
    assert.ok(rejected, 'recusa devolveu contexto');
    assert.equal(await itemStatus(), 'pending', 'Item recusado reabre para reenvio');
    assert.equal(await requestStatus(), 'open');
    assert.ok(rejected.token, 'recusa rotaciona o Link de Upload');
    assert.notEqual(rejected.token, firstLink.token, 'o link novo é diferente do antigo');
    console.log('  ✓ documento `rejected`, Item volta a `pending`, Link de Upload rotacionado');

    console.log('\n3. Exclusão do zip');
    assert.deepEqual(await zipFileNames(), [], 'documento recusado não entra na entrega');
    console.log('  ✓ zip vazio: o recusado está excluído');

    console.log('\n4. Painel de pendências');
    const missing = await panelItem();
    assert.equal(missing?.status, 'rejected', 'painel mostra `rejected`, não `pending`');
    console.log('  ✓ painel mostra o Item como recusado, aguardando reenvio');

    console.log('\n5. Reenvio');
    const secondDocumentId = await uploadOne(documents, uploadScope, itemId, 'extrato-v2.pdf');
    assert.notEqual(secondDocumentId, firstDocumentId);
    assert.equal(await itemStatus(), 'submitted', 'reenvio devolve o Item para conferência');
    assert.equal((await panelItem())?.resent, true, 'painel marca que é reenvio');
    assert.deepEqual(
      await zipFileNames(),
      ['Extrato bancário/extrato-v2.pdf'],
      'reenvio entra no zip da coleta aberta; o recusado continua fora',
    );
    console.log('  ✓ Item em `submitted`, marcado como reenvio, zip com o reenvio');

    console.log('\n6. Novo aceite');
    const accepted = await requests.acceptItem(firmScope, itemId, accountantId);
    assert.ok(accepted);
    assert.equal(await itemStatus(), 'accepted');
    assert.equal(accepted.completed, true, 'único Item obrigatório aceito fecha a Solicitação');
    assert.equal(await requestStatus(), 'complete');
    console.log('  ✓ Item `accepted` e Solicitação `complete`');

    console.log('\n7. Entrega final');
    assert.deepEqual(
      await zipFileNames(),
      ['Extrato bancário/extrato-v2.pdf'],
      'entrega tem só o aceito, na pasta do Item',
    );
    const [rejectedRow] = await db
      .select({ reviewStatus: document.reviewStatus })
      .from(document)
      .where(eq(document.id, firstDocumentId));
    assert.equal(rejectedRow.reviewStatus, 'rejected', 'o recusado continua recusado no histórico');
    assert.equal((await panelItem()) ?? null, null, 'Item aceito sai da lista de pendências');
    console.log('  ✓ zip entrega só o aceito; o recusado fica no histórico, fora da entrega');

    console.log('\n--- COM-152: ciclo completo verificado ---');
  } finally {
    /* Limpeza na ordem das FKs (`company` não tem cascade a partir de `accounting_firm`),
     * e sem deixar um erro de limpeza esconder a falha de verdade. */
    try {
      const rows = await db
        .select({ storageKey: document.storageKey })
        .from(document)
        .where(eq(document.requestId, requestId));
      await Promise.all(rows.map((row) => storage.remove(row.storageKey).catch(() => undefined)));

      await db.delete(document).where(eq(document.requestId, requestId));
      await db.delete(uploadLink).where(eq(uploadLink.requestId, requestId));
      await db.delete(requestItem).where(eq(requestItem.requestId, requestId));
      await db.delete(request).where(eq(request.id, requestId));
      await db.delete(period).where(eq(period.id, periodId));
      await db.delete(contact).where(eq(contact.companyId, companyId));
      await db.delete(company).where(eq(company.id, companyId));
      await db.delete(accountant).where(eq(accountant.id, accountantId));
      await db.delete(accountingFirm).where(eq(accountingFirm.id, firmId));
      await db.delete(user).where(eq(user.id, authUserId));
    } catch (cleanupError) {
      console.error('falha na limpeza da fixture:', cleanupError);
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
