import { zodResolver } from '@hookform/resolvers/zod';
import { email as emailSchema } from '@competa/contracts';
import { ArrowLeft, ArrowRight, MailCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import * as z from 'zod';
import { AuthCard, FormAlert, StatusIcon } from '@/features/auth/components/auth-shell';
import { useRequestPasswordReset } from '@/features/auth/queries/use-auth-mutations';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { apiErrorMessage } from '@/shared/lib/api-error';

const ForgotPasswordForm = z.object({
  email: emailSchema().min(1, 'Informe seu e-mail.'),
});
type ForgotPasswordForm = z.infer<typeof ForgotPasswordForm>;

export function ForgotPasswordPage() {
  const requestReset = useRequestPasswordReset();
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(ForgotPasswordForm),
    mode: 'onTouched',
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    await requestReset.mutateAsync(email).catch(() => undefined);
  });

  if (requestReset.isSuccess) {
    return (
      <AuthCard>
        <div className="text-center">
          <StatusIcon tone="primary">
            <MailCheck className="h-6 w-6" />
          </StatusIcon>
          <h1 className="font-display text-xl font-semibold tracking-tight">
            Verifique seu e-mail
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Enviamos um link para você redefinir sua senha.
          </p>
          <Button className="mt-6 w-full" variant="outline" asChild>
            <Link to="/entrar">Voltar para o login</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="text-center mb-6">
        <h1 className="font-display text-xl font-semibold tracking-tight">Esqueci minha senha</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Informe seu e-mail para receber um link de recuperação.
        </p>
      </div>

      {requestReset.error ? (
        <div className="mb-6">
          <FormAlert
            message={apiErrorMessage(
              requestReset.error,
              'Não foi possível solicitar a recuperação.',
            )}
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
            inputMode="email"
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
        <Link to="/entrar" className="inline-flex items-center hover:underline">
          <ArrowLeft className="mr-1 h-3 w-3" aria-hidden="true" />
          Voltar para o login
        </Link>
      </p>
    </AuthCard>
  );
}
