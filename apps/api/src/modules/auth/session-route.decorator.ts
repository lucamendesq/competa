import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { SessionGuard } from './session.guard.js';

export const SESSION_ROUTE = 'SESSION_ROUTE';

export const SessionRoute = () =>
  applyDecorators(SetMetadata(SESSION_ROUTE, true), UseGuards(SessionGuard));
