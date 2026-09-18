import { Component } from '@angular/core';
import { LegalPage } from './legal-page';

/* Conteúdo provisório até a revisão jurídica — a estrutura e o aceite já valem. */
@Component({
  selector: 'app-terms-page',
  imports: [LegalPage],
  template: `
    <app-legal-page title="Termos de Uso">
      <p>
        O Competa é um serviço de coleta de documentos contábeis operado pela Pygmus. Ao criar uma
        conta ou usar um Link de Envio, você concorda com estes termos.
      </p>
      <h2 class="text-base font-semibold">1. O serviço</h2>
      <p>
        O Competa permite que escritórios de contabilidade solicitem, recebam e organizem documentos
        das empresas que atendem. Quem envia documentos o faz a pedido da sua contabilidade.
      </p>
      <h2 class="text-base font-semibold">2. Contas e acesso</h2>
      <p>
        Contas de contador nascem por convite do escritório. O acesso de responsáveis de empresa é
        opcional e pode ser revogado pela contabilidade a qualquer momento. Você é responsável por
        manter suas credenciais em sigilo.
      </p>
      <h2 class="text-base font-semibold">3. Conteúdo enviado</h2>
      <p>
        Os documentos enviados pertencem a você ou à empresa que você representa. O Competa os
        armazena e disponibiliza apenas para a contabilidade responsável, conforme a Política de
        Privacidade.
      </p>
      <h2 class="text-base font-semibold">4. Encerramento</h2>
      <p>
        A contabilidade pode encerrar o serviço a qualquer momento. Os dados seguem a política de
        retenção descrita na Política de Privacidade.
      </p>
      <h2 class="text-base font-semibold">5. Contato</h2>
      <p>Dúvidas sobre estes termos: contato&#64;competa.com.br.</p>
    </app-legal-page>
  `,
})
export class TermsPage {}
