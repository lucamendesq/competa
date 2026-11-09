import { zodResolver } from '@hookform/resolvers/zod';
import { email } from '@competa/contracts';
import { ArrowLeft, ArrowRight, MailCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import * as z from 'zod';
import { AuthCard, FormAlert, StatusIcon } from '@/features/auth/components/auth-shell';
import { useRecoverLink } from '@/features/auth/queries/use-auth-mutations';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { apiErrorMessage } from '@/shared/lib/api-error';

const RecoverForm = z.object({ email: email().min(1, 'Informe seu e-mail.') });
type RecoverForm = z.infer<typeof RecoverForm>;

export function RecoverLinkPage() {
  const recover = useRecoverLink();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<RecoverForm>({
    resolver: zodResolver(RecoverForm),
    mode: 'onTouched',
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit((values) =>
    recover.mutateAsync(values.email).then(
      () => undefined,
      () => undefined,
    ),
  );

  if (recover.isSuccess) {
    return (
      <AuthCard>
        <div className="text-center">
          <StatusIcon tone="primary">
            <MailCheck className="h-6 w-6" aria-hidden="true" />
          </StatusIcon>
          <h1 className="font-display text-xl font-semibold tracking-tight">
            Verifique seu e-mail
          </h1>
          <p className="text-muted-foreground mt-2 text-sm" role="status">
            Se o e-mail estiver cadastrado, você receberá instruções para recuperar seu link de
            envio em instantes.
          </p>
          <Button className="mt-6 w-full" variant="outline" asChild>
            <Link to="/minha-area/acesso">Voltar para o início</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="text-center mb-6">
        <h1 className="font-display text-xl font-semibold tracking-tight">Recuperar Link</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Informe o e-mail que você usa para enviar documentos para sua contabilidade.
        </p>
      </div>
      {recover.error ? (
        <div className="mb-6">
          <FormAlert
            message={apiErrorMessage(recover.error, 'Não foi possível solicitar a recuperação.')}
          />
        </div>
      ) : null}
      <form noValidate className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">
            E-mail{' '}
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
          {errors.email ? (
            <p id="email-error" className="text-destructive text-xs">
              {errors.email.message}
            </p>
          ) : null}
        </div>
        <Button size="lg" type="submit" className="mt-2 w-full" disabled={isSubmitting || !isValid}>
          {isSubmitting ? 'Enviando…' : 'Enviar e-mail'}
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
      <p className="text-muted-foreground mt-6 text-center text-sm">
        <Link to="/minha-area/acesso" className="inline-flex items-center hover:underline">
          <ArrowLeft className="mr-1 h-3 w-3" aria-hidden="true" />
          Voltar para o login
        </Link>
      </p>
    </AuthCard>
  );
}
