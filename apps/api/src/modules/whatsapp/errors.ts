import { AppError } from '../../lib/app-error.js';

/** Enviar teste sem integração ativa é conflito de estado, não falha do servidor: o
 *  Contador precisa conectar o WhatsApp antes. Vinha como `Error` cru, que o mapa de erros
 *  só sabia tratar como 500. */
export class WhatsappNotConnected extends AppError {
  readonly code = 'WHATSAPP_NOT_CONNECTED';
  readonly status = 409;

  constructor() {
    super('Conecte o WhatsApp da Contabilidade antes de enviar um teste.');
  }
}
