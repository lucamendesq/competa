import { env } from '@/shared/config/env';

export const apiUrl = (path: string) => `${env.apiUrl}${path}`;

export const envelope = <T>(data: T) => ({ data });
