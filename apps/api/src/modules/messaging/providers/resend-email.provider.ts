import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import env from '../../../config/env.js';
import { MessageProvider, type MessageToSend } from './message.provider.js';

@Injectable()
export class ResendEmail extends MessageProvider {
  private readonly resend = new Resend(env.RESEND_API_KEY);

  async send({ recipient, subject, body }: MessageToSend) {
    // A SDK da Resend não lança: devolve `{ data, error }`. Sem esta checagem, chave
    // inválida ou domínio não verificado seriam gravados como envio bem-sucedido.
    const { error } = await this.resend.emails.send({
      from: env.EMAIL_FROM,
      to: recipient,
      subject,
      html: body,
    });

    if (error) throw new Error(`${error.name}: ${error.message}`);
  }
}
