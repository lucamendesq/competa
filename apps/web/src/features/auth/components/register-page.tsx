import { useState, type FormEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Cnpj, PublicSignUpBody, email as emailSchema, newPassword } from '@competa/contracts';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Download,
  Link as LinkIcon,
  Zap,
} from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import * as z from 'zod';
import {
  AuthShell,
  FormAlert,
  RequiredMark,
  type Benefit,
} from '@/features/auth/components/auth-shell';
import { useRegisterFirm } from '@/features/auth/queries/use-auth-mutations';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { apiErrorMessage, applyFieldErrors } from '@/shared/lib/api-error';
import { cn } from '@/shared/lib/cn';
import { cnpjInputMask } from '@/shared/lib/format';

const RegisterForm = z.object({
  userName: PublicSignUpBody.shape.userName,
  email: emailSchema().min(1, 'Informe seu e-mail.'),
  password: newPassword('A senha precisa de pelo menos 8 caracteres.'),
  firmName: PublicSignUpBody.shape.firmName,
  cnpj: z
    .string()
    .trim()
    .refine((value) => value === '' || Cnpj.safeParse(value).success, 'CNPJ inválido.'),
});
type RegisterForm = z.infer<typeof RegisterForm>;

const StepOne = RegisterForm.pick({ userName: true, email: true, password: true });
const STEP_ONE_FIELDS = ['userName', 'email', 'password'] as const;

const BENEFITS: Benefit[] = [
  {
    icon: Zap,
    title: 'Teste grátis de 14 dias',
    text: 'Acesso completo a todos os recursos, sem necessidade de cartão de crédito.',
  },
  {
    icon: LinkIcon,
    title: 'Seus clientes enviam sem senha',
    text: 'Links diretos para upload, sem barreiras de login para o responsável da empresa.',
  },
  {
    icon: Download,
    title: 'Chega de garimpar no WhatsApp',
    text: 'Documentos recebidos e agrupados em zip por empresa e competência.',
  },
];

const SUBMIT_FALLBACK = 'Não foi possível criar a conta. Verifique os dados e tente novamente.';

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="text-destructive text-xs">
      {message}
    </p>
  );
}

function StepDot({ step, active, done }: { step: number; active: boolean; done: boolean }) {
  return (
    <span
      className={cn(
        'flex size-7 items-center justify-center rounded-full text-xs font-semibold',
        active && 'bg-primary text-primary-foreground',
        !active && done && 'bg-primary/15 text-primary',
        !active && !done && 'bg-muted text-muted-foreground',
      )}
    >
      {step}
    </span>
  );
}

export function RegisterPage() {
  const [step, setStep] = useState<'user' | 'firm'>('user');
  const registerFirm = useRegisterFirm();
  const navigate = useNavigate();

  const {
    register,
    control,
    handleSubmit,
    trigger,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(RegisterForm),
    mode: 'onTouched',
    defaultValues: { userName: '', email: '', password: '', firmName: '', cnpj: '' },
  });

  const [userName, email, password, firmName] = useWatch({
    control,
    name: ['userName', 'email', 'password', 'firmName'],
  });
  const stepOneValid = StepOne.safeParse({ userName, email, password }).success;
  const firmNameValid = RegisterForm.shape.firmName.safeParse(firmName).success;

  const goToFirmStep = async () => {
    registerFirm.reset();
    if (await trigger(STEP_ONE_FIELDS)) setStep('firm');
  };

  const backToUserStep = () => {
    registerFirm.reset();
    setStep('user');
  };

  const createAccount = handleSubmit(async ({ cnpj, ...values }) => {
    await registerFirm.mutateAsync({ ...values, ...(cnpj ? { cnpj } : {}) }).then(
      () => navigate('/competencias', { replace: true }),
      (error: unknown) => applyFieldErrors(error, setError),
    );
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (step === 'user') {
      event.preventDefault();
      return goToFirmStep();
    }
    return createAccount(event);
  };

  const describedBy = (field: keyof RegisterForm, id: string) => (errors[field] ? id : undefined);

  return (
    <AuthShell
      headline="Comece seu teste grátis de 14 dias."
      summary="Automatize a coleta mensal de documentos da sua contabilidade em poucos minutos."
      benefits={BENEFITS}
    >
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">Criar conta</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {step === 'user'
              ? 'Passo 1 de 2: Seus dados de acesso'
              : 'Passo 2 de 2: Sua contabilidade'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <StepDot step={1} active={step === 'user'} done={step === 'firm'} />
          <span className="bg-border h-0.5 w-4" />
          <StepDot step={2} active={step === 'firm'} done={false} />
        </div>
      </div>

      {registerFirm.error ? (
        <div className="mb-6">
          <FormAlert message={apiErrorMessage(registerFirm.error, SUBMIT_FALLBACK)} />
        </div>
      ) : null}

      <form noValidate onSubmit={onSubmit}>
        <div className="flex flex-col gap-4" hidden={step !== 'user'}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-name">
              Seu nome completo <RequiredMark />
            </Label>
            <Input
              id="user-name"
              type="text"
              autoComplete="name"
              placeholder="Ex.: Carlos Mendes"
              aria-invalid={errors.userName ? true : undefined}
              aria-describedby={describedBy('userName', 'user-name-error')}
              {...register('userName')}
            />
            <FieldError id="user-name-error" message={errors.userName?.message} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">
              Seu e-mail profissional <RequiredMark />
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="contador@escritorio.com.br"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={describedBy('email', 'email-error')}
              {...register('email')}
            />
            <FieldError id="email-error" message={errors.email?.message} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">
              Senha <RequiredMark />
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo de 8 caracteres"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={describedBy('password', 'password-error')}
              {...register('password')}
            />
            <FieldError id="password-error" message={errors.password?.message} />
          </div>

          <Button type="submit" size="lg" className="mt-2 w-full" disabled={!stepOneValid}>
            Continuar
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex flex-col gap-4" hidden={step !== 'firm'}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="firm-name">
              Nome da Contabilidade <RequiredMark />
            </Label>
            <Input
              id="firm-name"
              type="text"
              autoComplete="organization"
              placeholder="Ex.: Mendes & Silva Contabilidade"
              aria-invalid={errors.firmName ? true : undefined}
              aria-describedby={describedBy('firmName', 'firm-name-error')}
              {...register('firmName')}
            />
            <FieldError id="firm-name-error" message={errors.firmName?.message} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="firm-cnpj">CNPJ da Contabilidade</Label>
            <Controller
              control={control}
              name="cnpj"
              render={({ field }) => (
                <Input
                  id="firm-cnpj"
                  type="text"
                  inputMode="numeric"
                  placeholder="00.000.000/0001-00"
                  aria-invalid={errors.cnpj ? true : undefined}
                  aria-describedby={cn(
                    'firm-cnpj-hint',
                    errors.cnpj ? 'firm-cnpj-error' : undefined,
                  )}
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(event) => field.onChange(cnpjInputMask(event.target.value))}
                />
              )}
            />
            <p id="firm-cnpj-hint" className="text-muted-foreground text-xs">
              Opcional agora; pedido na hora de assinar um plano.
            </p>
            <FieldError id="firm-cnpj-error" message={errors.cnpj?.message} />
          </div>

          <div className="bg-muted/50 border-border rounded-lg border p-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>Conta master e titularidade</span>
            </div>
            <p className="mt-1">
              Você será cadastrado como o proprietário da contabilidade e poderá convidar outros
              contadores da sua equipe depois.
            </p>
          </div>

          <div className="mt-2 flex gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={backToUserStep}
              disabled={isSubmitting}
            >
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Voltar
            </Button>
            <Button
              type="submit"
              size="lg"
              className="flex-1"
              disabled={isSubmitting || !firmNameValid}
            >
              {isSubmitting ? 'Criando conta…' : 'Criar conta'}
              {isSubmitting ? null : <Check className="ml-2 h-4 w-4" aria-hidden="true" />}
            </Button>
          </div>
        </div>
      </form>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        Já tem uma conta?{' '}
        <Link to="/entrar" className="text-primary font-medium hover:underline">
          Entrar
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
