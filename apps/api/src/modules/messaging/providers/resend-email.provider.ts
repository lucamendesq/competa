import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import env from '../../../config/env.js';
import { emailLayout } from '../email-layout.js';
import { MessageProvider, type MessageToSend } from './message.provider.js';

const PRODUCT_NAME = 'Competa';

@Injectable()
export class ResendEmail extends MessageProvider {
  private readonly resend = new Resend(env.RESEND_API_KEY);
  private readonly from = env.EMAIL_FROM!;

  private sender(senderName?: string) {
    if (!senderName) return this.from;

    const address = /<(.+)>/.exec(this.from)?.[1] ?? this.from;

    return `${senderName} via ${PRODUCT_NAME} <${address}>`;
  }

  async send({ recipient, subject, body, senderName }: MessageToSend) {
    const { error } = await this.resend.emails.send({
      from: this.sender(senderName),
      to: recipient,
      subject,
      html: emailLayout(body, senderName),
    });

    if (error) throw new Error(`${error.name}: ${error.message}`);
  }
}
