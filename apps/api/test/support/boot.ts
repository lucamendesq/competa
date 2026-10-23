import { createApp } from '../../src/app.js';

export interface RunningApp {
  url: string;
  close(): Promise<void>;
}

export async function bootApp(): Promise<RunningApp> {
  const app = await createApp();
  await app.listen(0);
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  return {
    url,
    close: async () => {
      await app.close();
    },
  };
}
