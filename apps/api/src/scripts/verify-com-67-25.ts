/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
import { S3ServiceException } from '@aws-sdk/client-s3';
import { v7 as uuidv7 } from 'uuid';
import { db } from '../infra/database/index.js';
import { accountant, accountingFirm, user } from '../infra/database/schema/index.js';
import { CompanyRepository } from '../modules/companies/company.repository.js';
import { PeriodRepository } from '../modules/periods/period.repository.js';
import { LocalStorage } from '../infra/storage/local.storage.js';
import { R2Storage } from '../infra/storage/r2.storage.js';
import { toFirmScope, toUploadScope } from '../modules/auth/scope.js';
import { ServiceUnavailable } from '../lib/app-error.js';
import { DocumentRepository } from '../modules/requests/document.repository.js';

async function run() {
  console.log('--- Iniciando Verificação de COM-67 e COM-25 ---\n');

  // ==========================================
  // Teste 1: COM-67 (Storage & Error Handling)
  // ==========================================
  console.log('1. Testando COM-67: LocalStorage.statSize...');
  const localStorage = new LocalStorage();
  const nonExistentSize = await localStorage.statSize('non-existent-key-12345');
  assert.equal(nonExistentSize, undefined, 'Arquivo inexistente deve retornar undefined');
  console.log('   ✓ LocalStorage.statSize inexistente retorna undefined.');

  console.log('2. Testando COM-67: R2Storage.statSize tratamento de 404 vs 500...');
  const r2Storage = new R2Storage();
  const r2Client = (r2Storage as any).client;

  // Mock send do client S3 para testar 404
  let sendCalls = 0;
  r2Client.send = async () => {
    sendCalls++;
    const err = new S3ServiceException({
      name: 'NoSuchKey',
      $fault: 'client',
      $metadata: { httpStatusCode: 404 },
    });
    throw err;
  };

  const r2NotFound = await r2Storage.statSize('fake-key');
  assert.equal(r2NotFound, undefined, '404/NoSuchKey no R2 deve retornar undefined');
  assert.equal(sendCalls, 1, '404 não deve gerar retentativas');
  console.log('   ✓ R2Storage.statSize 404/NoSuchKey retorna undefined sem retry.');

  // Mock send do client S3 para testar 500 / Service Unavailable com retry
  sendCalls = 0;
  r2Client.send = async () => {
    sendCalls++;
    const err = new S3ServiceException({
      name: 'InternalError',
      $fault: 'server',
      $metadata: { httpStatusCode: 500 },
    });
    throw err;
  };

  let threwServiceUnavailable = false;
  try {
    await r2Storage.statSize('fake-key-500');
  } catch (error) {
    if (error instanceof ServiceUnavailable) {
      threwServiceUnavailable = true;
    }
  }
  assert.equal(threwServiceUnavailable, true, 'Erro 500 no R2 deve lançar ServiceUnavailable');
  assert.equal(sendCalls, 3, 'Erro transitório no R2 deve retentar 3 vezes antes de falhar');
  console.log('   ✓ R2Storage.statSize erro 500 retenta 3 vezes e lança ServiceUnavailable.');

  // Testando que DocumentRepository.confirm rethrow ServiceUnavailable
  console.log('3. Testando COM-67: DocumentRepository.confirm com falha de storage...');
  const docRepo = new DocumentRepository(db as any, r2Storage);
  let documentDiscarded = false;
  let storageRemoved = false;
  (docRepo as any).discard = async () => {
    documentDiscarded = true;
  };
  (r2Storage as any).remove = async () => {
    storageRemoved = true;
  };
  (docRepo as any).pendingUpload = async () => [
    {
      id: uuidv7(),
      storageKey: 'fake-key',
      fileName: 'doc.pdf',
      declaredBytes: 1000,
    },
  ];

  let confirmThrew503 = false;
  try {
    await docRepo.confirm(toUploadScope('req-1', 'cont-1'), ['doc-1']);
  } catch (error) {
    if (error instanceof ServiceUnavailable) {
      confirmThrew503 = true;
    }
  }
  assert.equal(confirmThrew503, true, 'confirm deve propagar ServiceUnavailable');
  assert.equal(documentDiscarded, false, 'Documento NÃO pode ser descartado em erro transitório');
  assert.equal(
    storageRemoved,
    false,
    'Documento NÃO pode ser removido do storage em erro transitório',
  );
  console.log('   ✓ DocumentRepository.confirm preserva arquivos e lança ServiceUnavailable.');

  // ==========================================
  // Teste 2: COM-25 (Filtro por Contador)
  // ==========================================
  console.log('\n4. Testando COM-25: Cadastro de empresa com contador responsável...');
  const firmId = uuidv7();
  await db.insert(accountingFirm).values({ id: firmId, name: 'Firma Teste Carteira' });
  const firmScope = toFirmScope(firmId);

  const user1Id = uuidv7();
  await db.insert(user).values({
    id: user1Id,
    name: 'Contador Carlos',
    email: `carlos-${firmId}@test.com`,
    emailVerified: true,
  });
  const acc1Id = uuidv7();
  await db.insert(accountant).values({
    id: acc1Id,
    authUserId: user1Id,
    accountingFirmId: firmId,
    owner: true,
  });

  const user2Id = uuidv7();
  await db.insert(user).values({
    id: user2Id,
    name: 'Contadora Ana',
    email: `ana-${firmId}@test.com`,
    emailVerified: true,
  });
  const acc2Id = uuidv7();
  await db.insert(accountant).values({
    id: acc2Id,
    authUserId: user2Id,
    accountingFirmId: firmId,
    owner: false,
  });

  const companyRepo = new CompanyRepository(db as any);
  const createdCompany = await companyRepo.create(firmScope, {
    name: 'Empresa Carteira Ana',
    responsibleAccountantId: acc2Id,
    flags: {},
    contact: {
      name: 'Responsável Ana',
      email: `resp-${firmId}@test.com`,
    },
  });

  assert.equal(
    createdCompany.responsibleAccountantId,
    acc2Id,
    'Empresa deve ser criada com o responsibleAccountantId correto',
  );

  const foundCompany = await companyRepo.findById(firmScope, createdCompany.id);
  assert.ok(foundCompany, 'Empresa deve ser encontrada por findById');
  assert.equal(foundCompany.responsibleAccountantId, acc2Id);
  assert.equal(foundCompany.responsibleAccountantName, 'Contadora Ana');
  console.log(
    '   ✓ CompanyRepository.create e findById persistem e retornam o contador responsável.',
  );

  const listCompanies = await companyRepo.list(firmScope, { page: 1, perPage: 10 });
  const inList = listCompanies.rows.find((r) => r.id === createdCompany.id);
  assert.ok(inList, 'Empresa deve estar na listagem');
  assert.equal(inList.responsibleAccountantId, acc2Id);
  assert.equal(inList.responsibleAccountantName, 'Contadora Ana');
  console.log(
    '   ✓ CompanyRepository.list retorna responsibleAccountantId e responsibleAccountantName.',
  );

  console.log('5. Testando COM-25: Painel de pendências com contador responsável...');
  const periodRepo = new PeriodRepository(db as any, null as any);
  const { period: openedPeriod } = await periodRepo.openWithFanOut(
    firmScope,
    { referenceMonth: '2026-09-01' },
    [
      {
        companyId: createdCompany.id,
        contactId: createdCompany.contacts[0].id,
        tokenHash: uuidv7(),
        expiresAt: new Date(Date.now() + 86400000),
        items: [
          {
            name: 'Extrato Bancário',
            acceptedFormats: ['pdf'],
            dueDate: '2026-09-10',
          },
        ],
      } as any,
    ],
  );

  const panelRows = await periodRepo.pendingPanel(firmScope, openedPeriod.id);
  assert.equal(panelRows.length, 1, 'Deve conter 1 empresa no painel');
  assert.equal(panelRows[0].companyId, createdCompany.id);
  assert.equal(panelRows[0].responsibleAccountantId, acc2Id);
  assert.equal(panelRows[0].responsibleAccountantName, 'Contadora Ana');
  console.log(
    '   ✓ PeriodRepository.pendingPanel retorna o contador responsável no resumo do painel.',
  );

  console.log('6. Testando COM-25: Atualização / Desvinculação do responsável...');
  await companyRepo.update(firmScope, createdCompany.id, {
    responsibleAccountantId: null,
  });

  const updatedCompany = await companyRepo.findById(firmScope, createdCompany.id);
  assert.ok(updatedCompany);
  assert.equal(updatedCompany.responsibleAccountantId, null);
  assert.equal(updatedCompany.responsibleAccountantName, null);
  console.log('   ✓ CompanyRepository.update permite desvincular o responsável (null).');

  console.log('\n--- TODOS OS TESTES PASSARAM COM SUCESSO! ---');
  process.exit(0);
}

run().catch((error) => {
  console.error('Erro na verificação:', error);
  process.exit(1);
});
