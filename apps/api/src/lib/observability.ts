import * as Sentry from '@sentry/nestjs';

type Channel = 'email' | 'push';
type MessagePurpose = 'link_delivery' | 'reminder' | 'rejection' | 'deadline_missed' | 'completion';

export function reportChannelFailure(
  channel: Channel,
  purpose: MessagePurpose | string,
  error: unknown,
) {
  Sentry.withScope((scope) => {
    scope.setTag('channel', channel);
    scope.setTag('purpose', purpose);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}
