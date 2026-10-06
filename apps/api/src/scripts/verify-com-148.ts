import assert from 'node:assert/strict';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db } from '../infra/database/index.js';
import { accountant, accountingFirm, user } from '../infra/database/schema/index.js';
import { AccountantRepository } from '../modules/auth/accountant.repository.js';
import type { AuthSession } from '../modules/auth/auth-provider.js';
import { InviteController } from '../modules/auth/invite.controller.js';
import { InviteRepository } from '../modules/auth/invite.repository.js';
import { TeamController } from '../modules/auth/team.controller.js';
import { UserDeviceRepository } from '../modules/auth/user-device.repository.js';
import { toFirmScope } from '../modules/auth/scope.js';
import {
  CannotRemoveOwner,
  OnlyOwnerCanInvite,
  OnlyOwnerCanManageTeam,
} from '../modules/auth/errors.js';

const sessionOf = (authUserId: string) => ({ user: { id: authUserId } }) as AuthSession;

const refuses = async (
  label: string,
  action: () => Promise<unknown>,
  expected: new () => Error,
) => {
  await assert.rejects(action, expected, label);
  console.log(`  ✓ ${label}`);
};

const allows = async (label: string, action: () => Promise<unknown>) => {
  await action();
  console.log(`  ✓ ${label}`);
};

async function run() {
  console.log('--- COM-148: papel de não-dono e autorização owner-only ---\n');

  const firmId = uuidv7();
  await db.insert(accountingFirm).values({ id: firmId, name: 'Contabilidade COM-148' });
  const scope = toFirmScope(firmId);

  const ownerUserId = uuidv7();
  const memberUserId = uuidv7();
  await db.insert(user).values([
    { id: ownerUserId, name: 'Dona', email: `dona-${firmId}@test.com`, emailVerified: true },
    { id: memberUserId, name: 'Contador 2', email: `c2-${firmId}@test.com`, emailVerified: true },
  ]);

  const ownerAccountantId = uuidv7();
  const memberAccountantId = uuidv7();
  await db.insert(accountant).values([
    { id: ownerAccountantId, authUserId: ownerUserId, accountingFirmId: firmId, owner: true },
    { id: memberAccountantId, authUserId: memberUserId, accountingFirmId: firmId, owner: false },
  ]);

  const accountants = new AccountantRepository(db);
  const invites = new InviteRepository(db);
  const devices = new UserDeviceRepository(db);
  const events = new EventEmitter2();
  const inviteController = new InviteController(invites, accountants, events);
  const teamController = new TeamController(accountants, invites, devices);

  try {
    console.log('1. Papel lido do banco');
    assert.equal(await accountants.isOwner(scope, ownerUserId), true, 'dona deve ser owner');
    assert.equal(
      await accountants.isOwner(scope, memberUserId),
      false,
      'contador 2 NÃO pode ser owner',
    );
    console.log('  ✓ owner=true para a dona, owner=false para o contador 2');

    console.log('\n2. Não-dono é recusado nas ações sensíveis');
    await refuses(
      'POST /invites → OnlyOwnerCanInvite',
      () =>
        inviteController.create(scope, memberAccountantId, sessionOf(memberUserId), {
          email: `convidado-${firmId}@test.com`,
        }),
      OnlyOwnerCanInvite,
    );
    await refuses(
      'DELETE /accountants/:id → OnlyOwnerCanManageTeam',
      () => teamController.remove(scope, sessionOf(memberUserId), { id: ownerAccountantId }),
      OnlyOwnerCanManageTeam,
    );
    await refuses(
      'PATCH /accounting-firm → OnlyOwnerCanManageTeam',
      () => teamController.updateFirm(scope, sessionOf(memberUserId), { name: 'Renomeada' }),
      OnlyOwnerCanManageTeam,
    );
    await refuses(
      'DELETE /invites/:id → OnlyOwnerCanManageTeam',
      () => teamController.revokeInvite(scope, sessionOf(memberUserId), { id: uuidv7() }),
      OnlyOwnerCanManageTeam,
    );

    console.log('\n3. Não-dono continua podendo ler');
    const listed = await teamController.list(scope);
    assert.equal(listed.length, 2, 'a equipe tem dois contadores');
    console.log('  ✓ GET /accountants devolve os dois contadores');

    console.log('\n4. Dona é permitida');
    const created = await inviteController.create(
      scope,
      ownerAccountantId,
      sessionOf(ownerUserId),
      { email: `convidado-${firmId}@test.com` },
    );
    assert.ok(created.url.includes('/convite/'), 'convite devolve URL de aceite');
    const pending = await teamController.pendingInvites(scope);
    assert.equal(pending.length, 1, 'convite aparece como pendente');
    console.log('  ✓ POST /invites cria e GET /invites lista o pendente');

    await allows('PATCH /accounting-firm aceito para a dona', () =>
      teamController.updateFirm(scope, sessionOf(ownerUserId), {
        name: 'Contabilidade COM-148 v2',
      }),
    );
    await allows('DELETE /invites/:id aceito para a dona', () =>
      teamController.revokeInvite(scope, sessionOf(ownerUserId), { id: created.id }),
    );
    assert.equal(
      (await teamController.pendingInvites(scope)).length,
      0,
      'convite revogado some da lista',
    );

    console.log('\n5. A dona não se remove nem por engano');
    await refuses(
      'DELETE /accountants/<dona> → CannotRemoveOwner',
      () => teamController.remove(scope, sessionOf(ownerUserId), { id: ownerAccountantId }),
      CannotRemoveOwner,
    );

    console.log('\n6. Dona remove o contador 2');
    await teamController.remove(scope, sessionOf(ownerUserId), { id: memberAccountantId });
    assert.equal((await teamController.list(scope)).length, 1, 'sobra só a dona');
    console.log('  ✓ remoção apaga o user (sessão e passkeys caem por cascade)');

    console.log('\n--- COM-148: tudo verificado ---');
  } finally {
    await db.delete(accountingFirm).where(eq(accountingFirm.id, firmId));
    await db.delete(user).where(eq(user.id, ownerUserId));
    await db.delete(user).where(eq(user.id, memberUserId));
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
