import { authHandlers } from '@/testing/mocks/handlers/auth';
import { periodHandlers } from '@/testing/mocks/handlers/periods';

export const handlers = [...authHandlers, ...periodHandlers];
