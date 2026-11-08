import { zodResolver } from '@hookform/resolvers/zod';
import { newPassword, plainName } from '@competa/contracts';
import { ArrowRight, Building, Building2, CircleAlert } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import * as z from 'zod';
import { AuthCard, FormAlert, StatusIcon } from '@/features/auth/components/auth-shell';
import { TermsConsent } from '@/shared/components/terms-consent';
import { useInviteQuery } from '@/features/auth/queries/session-queries';
import { useAcceptInvite } from '@/features/auth/queries/use-auth-mutations';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { ApiError, apiErrorMessage } from '@/shared/lib/api-error';

const InviteForm = z.object({
  name: plainName(255, 'Informe seu nome.', 'O nome deve ter no máximo 255 caracteres.'),
  password: newPassword('A senha precisa de pelo menos 8 caracteres.'),
});
type InviteForm = z.infer<typeof InviteForm>;

const HOME = { accounting_firm: '/competencias', company: '/minha-area/pendencias' } as const;

const signInPathFor = (error: unknown) => {
  const details =
    error instanceof ApiError
      ? (error.body as { error?: { details?: { target?: string } } })?.error?.details
      : undefined;
  return details?.target === 'company' ? '/minha-area/acesso' : '/entrar';
};

const Required = () => (
  <span className="text-destructive" aria-hidden="true">
    *
  </span>
);

export function InvitePage() {
  const { linkToken = '' } = useParams();
  const invite = useInviteQuery(linkToken);
  const accept = useAcceptInvite();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InviteForm>({
    resolver: zodResolver(InviteForm),
    mode: 'onTouched',
    defaultValues: { name: '', password: '' },
  });

  if (invite.isPending) {
    return (
      <AuthCard>
        <div className="text-center py-8 text-sm text-muted-foreground" role="status">
          Carregando convite…
        </div>
      </AuthCard>
    );
  }

  if (invite.isError) {
    return (
      <AuthCard>
        <div className="text-center">
          <StatusIcon tone="danger">
            <CircleAlert className="h-6 w-6" />
          </StatusIcon>
          <h1 className="font-display text-xl font-semibold tracking-tight">Convite inválido</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {apiErrorMessage(invite.error, 'Convite não encontrado ou expirado.')}
          </p>
          <Button className="mt-6 w-full" variant="outline" asChild>
            <Link to={signInPathFor(invite.error)}>Ir para o login</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  const { email, target, invitedBy, companyName } = invite.data;

  const onSubmit = handleSubmit(async (values) => {
    await accept.mutateAsync({ token: linkToken, target, email, ...values }).then(
      () => navigate(HOME[target], { replace: true }),
      () => undefined,
    );
  });

  return (
    <AuthCard>
      <div className="text-center mb-6">
        <StatusIcon tone="primary">
          {target === 'accounting_firm' ? (
            <Building2 className="h-6 w-6" />
          ) : (
            <Building className="h-6 w-6" />
          )}
        </StatusIcon>
        <h1 className="font-display text-xl font-semibold tracking-tight">Aceitar convite</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {target === 'accounting_firm' ? (
            <>
              Você foi convidado para participar da contabilidade <strong>{invitedBy}</strong>.
            </>
          ) : (
            <>
              A contabilidade <strong>{invitedBy}</strong> convidou você para enviar documentos da
              empresa <strong>{companyName}</strong>.
            </>
          )}
        </p>
      </div>

      {accept.error ? (
        <div className="mb-6">
          <FormAlert
            message={apiErrorMessage(accept.error, 'Não foi possível aceitar o convite.')}
          />
        </div>
      ) : null}

      <form noValidate className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-email">E-mail</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            disabled
            readOnly
            className="bg-muted text-muted-foreground"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">
            Seu nome <Required />
          </Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'name-error' : undefined}
            {...register('name')}
          />
          {errors.name ? (
            <p id="name-error" className="text-destructive text-xs">
              {errors.name.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">
            Defina uma senha <Required />
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          {errors.password ? (
            <p id="password-error" className="text-destructive text-xs">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <Button size="lg" type="submit" className="mt-2 w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Criando conta…' : 'Criar conta'}
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
        <TermsConsent action="Ao criar sua conta" className="text-center" />
      </form>
    </AuthCard>
  );
}
