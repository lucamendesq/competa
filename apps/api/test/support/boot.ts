import { createApp } from '../../src/app.js';
import { DeadlineCron } from '../../src/modules/requests/deadline.cron.js';

export interface RunningApp {
  url: string;
  runDeadlineSweep(): Promise<void>;
  close(): Promise<void>;
}

export async function bootApp(): Promise<RunningApp> {
  const app = await createApp();
  /* Como em produção (atrás do proxy da Fly): cada fixture manda um X-Forwarded-For
   * próprio e ganha um balde de throttle só seu. */
  app.set('trust proxy', 1);
  await app.listen(0);
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  return {
    url,
    /* O job diário não tem rota HTTP; o acoplamento ao DI mora no harness (reimplementado
     * na fase final como handle do runtime Effect), nunca nas suites. */
    runDeadlineSweep: () => app.get(DeadlineCron).daily(),
    close: async () => {
      await app.close();
    },
  };
}
