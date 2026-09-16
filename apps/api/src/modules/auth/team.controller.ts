import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import { IdParam, UpdateFirmBody } from '@contabilidade/contracts';
import { NotFound } from '../../lib/app-error.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { AccountantRepository } from './accountant.repository.js';
import type { AuthSession } from './auth-provider.js';
import { CurrentScope } from './current-scope.decorator.js';
import { CannotRemoveOwner, OnlyOwnerCanManageTeam } from './errors.js';
import { InviteRepository } from './invite.repository.js';
import type { FirmScope } from './scope.js';
import { Session } from './session.decorator.js';
import { UserDeviceRepository } from './user-device.repository.js';

@Controller()
export class TeamController {
  constructor(
    private readonly accountants: AccountantRepository,
    private readonly invites: InviteRepository,
    private readonly devices: UserDeviceRepository,
  ) {}

  @Get('accountants')
  async list(@CurrentScope() scope: FirmScope) {
    return this.accountants.list(scope);
  }

  /** Remover = apagar o `user`: sessão e passkeys caem por cascade — revogação de acesso
   *  imediata, não só saída da lista. */
  @Delete('accountants/:id')
  async remove(
    @CurrentScope() scope: FirmScope,
    @Session() session: AuthSession,
    @Param(zodPipe(IdParam)) params: IdParam,
  ) {
    if (!(await this.accountants.isOwner(scope, session.user.id))) {
      throw new OnlyOwnerCanManageTeam();
    }

    const target = await this.accountants.findInFirm(scope, params.id);
    if (!target) throw new NotFound('Contador não encontrado.');
    // cobre também o dono tentando se remover: o dono é sempre owner
    if (target.owner) throw new CannotRemoveOwner();

    await this.accountants.deleteAuthUser(target.authUserId);

    return { removed: true as const };
  }

  @Get('accounting-firm')
  async firm(@CurrentScope() scope: FirmScope) {
    const row = await this.accountants.firm(scope);
    if (!row) throw new NotFound('Contabilidade não encontrada.');

    return row;
  }

  @Get('accounting-firm/device-stats')
  async deviceStats(@CurrentScope() scope: FirmScope) {
    return this.devices.platformStats(scope);
  }


  @Patch('accounting-firm')
  async updateFirm(
    @CurrentScope() scope: FirmScope,
    @Session() session: AuthSession,
    @Body(zodPipe(UpdateFirmBody)) body: UpdateFirmBody,
  ) {
    if (!(await this.accountants.isOwner(scope, session.user.id))) {
      throw new OnlyOwnerCanManageTeam();
    }

    await this.accountants.updateFirm(scope, body);

    return this.accountants.firm(scope);
  }

  @Get('invites')
  async pendingInvites(@CurrentScope() scope: FirmScope) {
    return this.invites.listPending(scope);
  }

  @Delete('invites/:id')
  async revokeInvite(
    @CurrentScope() scope: FirmScope,
    @Session() session: AuthSession,
    @Param(zodPipe(IdParam)) params: IdParam,
  ) {
    if (!(await this.accountants.isOwner(scope, session.user.id))) {
      throw new OnlyOwnerCanManageTeam();
    }

    const revoked = await this.invites.revoke(scope, params.id);
    if (!revoked) throw new NotFound('Convite não encontrado ou já usado.');

    return { revoked: true as const };
  }
}
