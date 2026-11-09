import { PublicLayout } from '@/shared/components/layout/public-layout';

const sectionTitle = 'font-display text-base font-semibold text-foreground mt-8';

export function Component() {
  return (
    <PublicLayout title="Termos de Uso">
      <p>
        O Competa é um serviço de SaaS para gestão e coleta de documentos contábeis. Ao utilizar a
        plataforma, você concorda com estes termos.
      </p>

      <h2 className={sectionTitle}>1. Licença e Uso</h2>
      <p>
        A licença de uso do Competa é intransferível e não exclusiva, concedida apenas às
        contabilidades assinantes. Você não pode copiar, revender, ou usar o Competa de modo ilícito
        ou abusivo, incluindo mas não limitando à distribuição de malware nos uploads.
      </p>

      <h2 className={sectionTitle}>2. Responsabilidade do Cliente</h2>
      <p>
        Você (a contabilidade) é inteiramente responsável pelo conteúdo submetido, cobrado, e pelos
        dados pessoais fornecidos, incluindo as obrigações que surgem deles com as Empresas que você
        atende, de acordo com a LGPD e o contrato firmado com o seu cliente.
      </p>

      <h2 className={sectionTitle}>3. Suspensão de Serviço</h2>
      <p>
        A Competa se reserva ao direito de suspender ou encerrar o serviço nos casos de falta de
        pagamento, fraude, violação de segurança ou qualquer descumprimento destes termos.
      </p>

      <h2 className={sectionTitle}>4. Foro e Modificações</h2>
      <p>
        Podemos atualizar estes Termos no futuro mediante aviso. Em caso de litígio, fica eleito o
        Foro da Comarca de São Paulo/SP.
      </p>
    </PublicLayout>
  );
}
