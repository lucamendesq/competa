import { PublicLayout } from '@/shared/components/layout/public-layout';

const sectionTitle = 'font-display text-base font-semibold text-foreground mt-8';

export function Component() {
  return (
    <PublicLayout title="Política de Privacidade">
      <p>
        O Competa trata documentos fiscais e dados de contato <strong>como operador</strong>, por
        conta da contabilidade que contratou o serviço (controladora dos dados), nos termos da LGPD.
      </p>

      <h2 className={sectionTitle}>1. O que coletamos</h2>
      <p>
        Nome, e-mail e telefone dos responsáveis pelas empresas; os documentos enviados (notas,
        extratos, folhas e afins); e registros técnicos de acesso.
      </p>

      <h2 className={sectionTitle}>2. Para quê</h2>
      <p>
        Exclusivamente para a coleta e organização de documentos solicitados pela sua contabilidade.
        Não vendemos dados nem os usamos para publicidade.
      </p>

      <h2 className={sectionTitle}>3. Suboperadores</h2>
      <p>
        Armazenamento de documentos na Cloudflare (R2), banco de dados na Supabase e envio de
        e-mails pela Resend. Todos sob contrato e criptografia em trânsito.
      </p>

      <h2 className={sectionTitle}>4. Retenção</h2>
      <p>
        Documentos fiscais ficam guardados pelo prazo legal (em geral 5 anos). Quando uma
        contabilidade encerra o contrato, os dados são retidos por 90 dias e depois eliminados.
      </p>

      <h2 className={sectionTitle}>5. Seus direitos</h2>
      <p>
        Você pode pedir acesso, correção ou eliminação dos seus dados (arts. 18 e seguintes da LGPD)
        pelo e-mail contato@competa.com.br — respondemos em até 15 dias. Pedidos sobre documentos
        fiscais são encaminhados à contabilidade responsável, que é a controladora.
      </p>
    </PublicLayout>
  );
}
