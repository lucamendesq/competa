import { authHandlers } from '@/testing/mocks/handlers/auth';
import { contactAreaHandlers } from '@/testing/mocks/handlers/contact-area';
import { periodHandlers } from '@/testing/mocks/handlers/periods';

export const handlers = [...authHandlers, ...periodHandlers, ...contactAreaHandlers];
