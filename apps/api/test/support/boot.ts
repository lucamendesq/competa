import { createApp, type RunningApp } from '../../src/app.js';

export type { RunningApp };

/* `trustProxy: true` como em produção (atrás do proxy da Fly): cada fixture manda um
 * X-Forwarded-For próprio e ganha um balde de throttle só seu. */
export const bootApp = (): Promise<RunningApp> => createApp({ port: 0, trustProxy: true });
