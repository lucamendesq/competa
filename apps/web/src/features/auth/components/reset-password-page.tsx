import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, CheckCircle, CircleAlert } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import * as z from 'zod';
import { AuthCard, FormAlert, StatusIcon } from '@/features/auth/components/auth-shell';
import { useResetPassword } from '@/features/auth/queries/use-auth-mutations';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

const ResetPasswordForm = z.object({
  password: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.'),
});
type ResetPasswordForm = z.infer<typeof ResetPasswordForm>;

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const resetPassword = useResetPassword();
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(ResetPasswordForm),
    mode: 'onTouched',
    defaultValues: { password: '' },
  });

  const linkInvalid = !token || searchParams.has('error') || resetPassword.data === 'invalid-link';

  const onSubmit = handleSubmit(async ({ password }) => {
    if (!token) return;
    await resetPassword.mutateAsync({ newPassword: password, token }).catch(() => undefined);
  });

  if (linkInvalid) {
    return (
      <AuthCard>
        <div className="text-center">
          <StatusIcon tone="danger">
            <CircleAlert className="h-6 w-6" />
          </StatusIcon>
          <h1 className="font-display text-xl font-semibold tracking-tight">
            Link inválido ou expirado
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Este link de redefinição já foi usado, expirou ou está incompleto. Peça um novo e use o
            último e-mail que chegar.
          </p>
          <Button className="mt-6 w-full" asChild>
            <Link to="/esqueci-senha">Pedir novo link</Link>
          </Button>
          <Button className="mt-2 w-full" variant="outline" asChild>
            <Link to="/entrar">Voltar para o login</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (resetPassword.data === 'done') {
    return (
      <AuthCard>
        <div className="text-center">
          <StatusIcon tone="primary">
            <CheckCircle className="h-6 w-6" />
          </StatusIcon>
          <h1 className="font-display text-xl font-semibold tracking-tight">Senha alterada</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Sua senha foi atualizada com sucesso.
          </p>
          <Button className="mt-6 w-full" asChild>
            <Link to="/entrar">Entrar no painel</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="text-center mb-6">
        <h1 className="font-display text-xl font-semibold tracking-tight">Nova senha</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Defina uma nova senha para acessar sua conta.
        </p>
      </div>

      {resetPassword.error ? (
        <div className="mb-6">
          <FormAlert message={resetPassword.error.message} />
        </div>
      ) : null}

      <form noValidate className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">
            Nova senha{' '}
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
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

        <Button size="lg" type="submit" className="mt-2 w-full" disabled={isSubmitting || !isValid}>
          {isSubmitting ? 'Salvando…' : 'Redefinir senha'}
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
    </AuthCard>
  );
}
