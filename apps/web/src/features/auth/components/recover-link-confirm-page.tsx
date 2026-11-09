import { CircleAlert, MailCheck, RefreshCcw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { AuthCard, FormAlert, StatusIcon } from '@/features/auth/components/auth-shell';
import { useConfirmRecoverLink } from '@/features/auth/queries/use-auth-mutations';
import { Button } from '@/shared/components/ui/button';
import { apiErrorMessage } from '@/shared/lib/api-error';

export function RecoverLinkConfirmPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const confirm = useConfirmRecoverLink();

  if (!token) {
    return (
      <AuthCard>
        <div className="text-center">
          <StatusIcon tone="danger">
            <CircleAlert className="h-6 w-6" aria-hidden="true" />
          </StatusIcon>
          <h1 className="font-display text-xl font-semibold tracking-tight">Link inválido</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            O link acessado não possui o token necessário.
          </p>
          <Button className="mt-6 w-full" variant="outline" asChild>
            <Link to="/minha-area/acesso">Voltar para o início</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (confirm.isSuccess) {
    return (
      <AuthCard>
        <div className="text-center" role="status">
          <StatusIcon tone="primary">
            <MailCheck className="h-6 w-6" aria-hidden="true" />
          </StatusIcon>
          <h1 className="font-display text-xl font-semibold tracking-tight">Link renovado</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Enviamos seu novo link de acesso por e-mail.
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight">Confirmar recuperação</h1>
        <p className="text-muted-foreground mt-2 mb-6 text-sm">
          Clique abaixo para gerar um novo link de acesso e recebê-lo em seu e-mail. O link anterior
          deixará de funcionar.
        </p>
        {confirm.error ? (
          <div className="mb-6 text-left">
            <FormAlert
              message={apiErrorMessage(
                confirm.error,
                'Não foi possível confirmar. O link pode ter expirado.',
              )}
            />
          </div>
        ) : null}
        <Button
          size="lg"
          className="w-full"
          disabled={confirm.isPending}
          onClick={() => confirm.mutate(token)}
        >
          {confirm.isPending ? (
            <RefreshCcw className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          {confirm.isPending ? 'Gerando...' : 'Gerar novo link'}
        </Button>
      </div>
    </AuthCard>
  );
}
