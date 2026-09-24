import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import env from '../../../config/env.js';
import { emailLayout } from '../email-layout.js';
import { MessageProvider, type MessageToSend } from './message.provider.js';

const PRODUCT_NAME = 'Competa';

type ResendResponseError = {
  name?: string;
  message?: string;
  statusCode?: number | null;
  status?: number | null;
};

const isRetryable = (error: unknown): boolean => {
  if (!error) return false;
  if (typeof error === 'object') {
    const err = error as ResendResponseError;
    const status = err.statusCode ?? err.status;
    if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
      return true;
    }
    if (
      err.name === 'application_error' ||
      err.name === 'TimeoutError' ||
      err.name === 'AbortError'
    ) {
      return true;
    }
    const msg = String(err.message ?? '').toLowerCase();
    if (
      msg.includes('timeout') ||
      msg.includes('unable to fetch') ||
      msg.includes('fetch failed')
    ) {
      return true;
    }
  }
  return false;
};

const backoffWithJitter = (attempt: number, baseMs = 250): number => {
  const maxDelay = baseMs * 2 ** attempt;
  return Math.floor(Math.random() * maxDelay) + Math.floor(baseMs / 2);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class ResendEmail extends MessageProvider {
  private readonly resend = new Resend(env.RESEND_API_KEY);
  private readonly from = env.EMAIL_FROM!;

  private consecutiveFailures = 0;
  private openedAt = 0;
  private readonly failureThreshold = 5;
  private readonly cooldownMs = 30_000;

  private sender(senderName?: string) {
    if (!senderName) return this.from;

    const cleanName = senderName.replace(/[\r\n<>"]/g, '').trim();
    if (!cleanName) return this.from;

    const address = /<(.+)>/.exec(this.from)?.[1] ?? this.from;

    return `${cleanName} via ${PRODUCT_NAME} <${address}>`;
  }

  private checkCircuit() {
    if (this.consecutiveFailures >= this.failureThreshold) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed < this.cooldownMs) {
        throw new Error(
          `Resend circuit breaker is open (${Math.ceil((this.cooldownMs - elapsed) / 1000)}s cooldown remaining)`,
        );
      }
    }
  }

  async send({ recipient, subject, body, senderName }: MessageToSend) {
    this.checkCircuit();

    const maxRetries = 3;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { error } = await this.resend.emails.send(
          {
            from: this.sender(senderName),
            to: recipient,
            subject,
            html: emailLayout(body, senderName),
          },
          { signal: AbortSignal.timeout(10_000) } as never,
        );

        if (!error) {
          this.consecutiveFailures = 0;
          return;
        }

        lastError = error;
      } catch (err) {
        lastError = err;
      }

      if (attempt < maxRetries && isRetryable(lastError)) {
        await sleep(backoffWithJitter(attempt));
        continue;
      }

      break;
    }

    this.consecutiveFailures += 1;
    this.openedAt = Date.now();

    const message =
      lastError instanceof Error
        ? lastError.message
        : typeof lastError === 'object' && lastError && 'message' in lastError
          ? `${(lastError as { name?: string }).name ?? 'Error'}: ${(lastError as { message?: string }).message}`
          : String(lastError);

    throw new Error(message);
  }
}
