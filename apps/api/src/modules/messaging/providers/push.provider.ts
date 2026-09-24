export type PushMessage = {
  title: string;
  body: string;
  url?: string;
  subscriptions: { endpoint: string; keys: Record<string, string> }[];
};

export type PushResult = {
  sent: number;
  failed: number;
  gone: string[];
};

export abstract class PushProvider {
  abstract send(message: PushMessage): Promise<PushResult>;
}
