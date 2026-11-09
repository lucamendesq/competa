import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { newPassword } from '@competa/contracts';
import { ArrowRight, CheckCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import * as z from 'zod';
import { FormAlert, RequiredMark } from '@/features/auth/components/auth-shell';
import { useSetContactPassword } from '@/features/auth/queries/use-auth-mutations';
import { Logo } from '@/shared/components/logo';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { apiErrorMessage } from '@/shared/lib/api-error';

const PasswordForm = z.object({
  password: newPassword('A senha precisa de pelo menos 8 caracteres.'),
});
type PasswordForm = z.infer<typeof PasswordForm>;

export function ContactSetPasswordPage() {
  const setPassword = useSetContactPassword();
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<PasswordForm>({
    resolver: zodResolver(PasswordForm),
    mode: 'onTouched',
    defaultValues: { password: '' },
  });

  const onSubmit = handleSubmit((values) =>
    setPassword.mutateAsync(values.password).then(
      () => setDone(true),
      () => undefined,
    ),
  );

  return (
    <div className="bg-canvas min-h-dvh flex items-center justify-center p-4 sm:p-8">
      <div className="bg-card border-border w-full max-w-md rounded-xl border p-6 shadow-sm sm:p-8">
        <div className="flex justify-center mb-6">
          <Logo className="h-8" />
        </div>

        {done ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight font-display text-foreground">
              Senha definida
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Você já pode acessar sua área exclusiva usando seu e-mail e a nova senha.
            </p>
            <Button className="mt-6 w-full font-medium" asChild>
              <Link to="/minha-area/pendencias">Ver pendências</Link>
            </Button>
          </div>
        ) : (
          <div>
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold tracking-tight font-display text-foreground">
                Definir senha de acesso
              </h1>
              <p className="text-muted-foreground mt-2 text-sm">
                Crie uma senha para acompanhar as pendências da sua empresa.
              </p>
            </div>
            {setPassword.error ? (
              <div className="mb-6">
                <FormAlert
                  message={apiErrorMessage(setPassword.error, 'Não foi possível definir a senha.')}
                />
              </div>
            ) : null}
            <form noValidate className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">
                  Senha <RequiredMark />
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
              <Button
                size="lg"
                type="submit"
                className="mt-2 w-full font-medium"
                disabled={isSubmitting || !isValid}
              >
                {isSubmitting ? 'Salvando…' : 'Definir senha'}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
