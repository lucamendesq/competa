import { zodResolver } from '@hookform/resolvers/zod';
import { email as emailSchema } from '@competa/contracts';
import { ArrowRight, Download, Link as LinkIcon, Zap } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import * as z from 'zod';
import { useSignInAccountant } from '@/features/auth/queries/use-auth-mutations';
import {
  AuthShell,
  FormAlert,
  RequiredMark,
  type Benefit,
} from '@/features/auth/components/auth-shell';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

const LoginForm = z.object({
  email: emailSchema().min(1, 'Informe seu e-mail.'),
  password: z.string().min(1, 'Informe sua senha.'),
});
type LoginForm = z.infer<typeof LoginForm>;

const BENEFITS: Benefit[] = [
  {
    icon: Zap,
    title: 'Abra a competência com 1 clique',
    text: 'Uma solicitação por empresa ativa, com o checklist e os prazos já congelados.',
  },
  {
    icon: LinkIcon,
    title: 'Seu cliente envia sem senha e sem cadastro',
    text: 'O Responsável recebe um link de upload com validade e escopo só de envio.',
  },
  {
    icon: Download,
    title: 'Baixe tudo organizado em zip',
    text: 'Por empresa e competência, ou a competência inteira de uma vez.',
  },
];

const linkClass = 'text-primary font-medium hover:underline';

export function LoginPage() {
  const signIn = useSignInAccountant();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(LoginForm),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await signIn.mutateAsync(values).then(
      () => navigate(from ?? '/competencias', { replace: true }),
      () => undefined,
    );
  });

  return (
    <AuthShell
      headline="Pare de garimpar documento no WhatsApp."
      summary="Defina o checklist mensal de cada empresa, abra a competência e receba tudo organizado — sem cobrar documento um por um."
      benefits={BENEFITS}
    >
      <h1 className="font-display text-xl font-semibold tracking-tight">
        Acessar painel do Contador
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Informe suas credenciais para gerenciar suas competências.
      </p>

      {signIn.error ? (
        <div className="mt-6">
          <FormAlert message={signIn.error.message || 'E-mail ou senha inválidos.'} />
        </div>
      ) : null}

      <form noValidate className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">
            E-mail <RequiredMark />
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="contador@escritorio.com.br"
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">
            Senha <RequiredMark />
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
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
          {isSubmitting ? 'Entrando…' : 'Entrar'}
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      </form>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        Ainda não tem conta?{' '}
        <Link to="/cadastro" className={linkClass}>
          Crie sua conta grátis
        </Link>
      </p>
      <p className="text-muted-foreground mt-2 text-center text-sm">
        <Link to="/esqueci-senha" className={linkClass}>
          Esqueci minha senha
        </Link>
      </p>
      <p className="text-muted-foreground mt-3 text-center text-sm">
        Recebeu convite de outro contador? Use o link do convite que chegou no seu e-mail.
      </p>
      <p className="text-muted-foreground mt-3 border-t pt-4 text-center text-sm">
        Você envia documentos para uma contabilidade?{' '}
        <Link to="/perdi-meu-link" className={linkClass}>
          Perdi meu link
        </Link>
      </p>
      <p className="text-muted-foreground mt-4 text-center text-xs">
        <Link to="/termos" className="hover:underline">
          Termos de Uso
        </Link>{' '}
        &middot;{' '}
        <Link to="/privacidade" className="hover:underline">
          Privacidade
        </Link>
      </p>
    </AuthShell>
  );
}
