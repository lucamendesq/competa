import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { email } from '@competa/contracts';
import { Mail } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import * as z from 'zod';
import { RequiredMark } from '@/features/auth/components/auth-shell';
import { useSendMagicLink, useSignInContact } from '@/features/auth/queries/use-auth-mutations';
import { Logo } from '@/shared/components/logo';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

const SignInForm = z.object({
  email: email().min(1, 'Informe o seu e-mail.'),
  password: z.string().min(1, 'Informe sua senha.'),
});
type SignInForm = z.infer<typeof SignInForm>;

const LinkForm = z.object({ linkEmail: email().min(1, 'Informe o seu e-mail.') });
type LinkForm = z.infer<typeof LinkForm>;

const SIGN_IN_FAILED = 'E-mail ou senha inválidos. Se você entra pelo link, use a opção abaixo.';
const LINK_FAILED = 'Não foi possível enviar o link. Confira o e-mail e tente de novo.';

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? (
    <p id={id} className="text-destructive text-xs">
      {message}
    </p>
  ) : null;
}

export function ContactSignInPage() {
  const navigate = useNavigate();
  const signIn = useSignInContact();
  const sendLink = useSendMagicLink();
  const [error, setError] = useState<string | null>(null);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);

  const signInForm = useForm<SignInForm>({
    resolver: zodResolver(SignInForm),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });
  const linkForm = useForm<LinkForm>({
    resolver: zodResolver(LinkForm),
    mode: 'onTouched',
    defaultValues: { linkEmail: '' },
  });
  const signInErrors = signInForm.formState.errors;
  const linkErrors = linkForm.formState.errors;

  const onSignIn = signInForm.handleSubmit((values) => {
    setError(null);
    return signIn
      .mutateAsync(values)
      .then(() => navigate('/minha-area/pendencias'))
      .catch(() => setError(SIGN_IN_FAILED));
  });

  const onRequestLink = linkForm.handleSubmit((values) => {
    setError(null);
    return sendLink
      .mutateAsync({
        email: values.linkEmail,
        callbackURL: `${window.location.origin}/minha-area/pendencias`,
      })
      .then(() => {
        setLinkSentTo(values.linkEmail);
        toast.success('Link de acesso enviado para o seu e-mail.');
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error && cause.message ? cause.message : LINK_FAILED),
      );
  });

  return (
    <div className="bg-canvas flex min-h-dvh flex-col items-center justify-center gap-6 p-4 sm:p-6">
      <Logo className="h-8" />
      <div className="bg-card border-border w-full max-w-md rounded-xl border p-6 sm:p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight font-display text-foreground">
          Entrar na minha área
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Aqui você vê o que falta enviar, o que já mandou e o que a contabilidade recusou.
        </p>

        {error ? (
          <div
            className="mt-5 rounded-lg border border-danger-border bg-danger-surface p-3 text-sm text-danger-foreground"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <form noValidate className="mt-6 flex flex-col gap-4" onSubmit={onSignIn}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email-password">
              Seu e-mail <RequiredMark />
            </Label>
            <Input
              id="email-password"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="voce@suaempresa.com.br"
              aria-invalid={signInErrors.email ? true : undefined}
              aria-describedby={signInErrors.email ? 'email-error' : undefined}
              {...signInForm.register('email')}
            />
            <FieldError id="email-error" message={signInErrors.email?.message} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="access-password-field">Sua senha</Label>
            <Input
              id="access-password-field"
              type="password"
              autoComplete="current-password"
              aria-invalid={signInErrors.password ? true : undefined}
              aria-describedby={signInErrors.password ? 'password-error' : undefined}
              {...signInForm.register('password')}
            />
            <FieldError id="password-error" message={signInErrors.password?.message} />
          </div>
          <Button
            size="lg"
            type="submit"
            className="w-full font-medium"
            disabled={signInForm.formState.isSubmitting || !signInForm.formState.isValid}
          >
            {signInForm.formState.isSubmitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <span className="bg-border h-px flex-1" />
          <span className="text-muted-foreground text-xs font-medium">
            ou receba um link por e-mail
          </span>
          <span className="bg-border h-px flex-1" />
        </div>

        {linkSentTo ? (
          <p
            className="rounded-lg border border-success-border bg-success-surface p-3 text-sm text-success-foreground"
            role="status"
          >
            Enviamos um link de acesso para <strong>{linkSentTo}</strong>. Abra o e-mail neste
            aparelho para entrar.
          </p>
        ) : (
          <form noValidate className="flex flex-col gap-3" onSubmit={onRequestLink}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="link-email">
                Seu e-mail <RequiredMark />
              </Label>
              <Input
                id="link-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="voce@suaempresa.com.br"
                aria-invalid={linkErrors.linkEmail ? true : undefined}
                aria-describedby={linkErrors.linkEmail ? 'link-error' : undefined}
                {...linkForm.register('linkEmail')}
              />
              <FieldError id="link-error" message={linkErrors.linkEmail?.message} />
            </div>
            <Button
              size="lg"
              type="submit"
              variant="outline"
              className="w-full hover:bg-muted font-medium"
              disabled={linkForm.formState.isSubmitting || !linkForm.formState.isValid}
            >
              <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
              {linkForm.formState.isSubmitting ? 'Enviando…' : 'Receber link por e-mail'}
            </Button>
          </form>
        )}

        <p className="text-muted-foreground mt-6 text-xs">
          Ainda não tem acesso? Você não precisa dele para enviar documentos — use o link que a sua
          contabilidade manda por e-mail.{' '}
          <Link to="/perdi-meu-link" className="text-primary font-medium hover:underline">
            Perdi meu link
          </Link>
        </p>
      </div>
    </div>
  );
}
