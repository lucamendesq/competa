import { zodResolver } from '@hookform/resolvers/zod';
import { CreateInviteBody } from '@competa/contracts';
import { Check, Copy } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { useCreateInvite } from '@/features/team/queries/use-team-mutations';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { useCopy } from '@/shared/hooks/use-copy';
import { apiErrorMessage } from '@/shared/lib/api-error';

type InviteValues = { email: string };

export function InviteForm({ onClose }: { onClose: () => void }) {
  const createInvite = useCreateInvite();
  const { copiedKey, copy } = useCopy();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(CreateInviteBody),
    defaultValues: { email: '' },
  });
  const email = useWatch({ control, name: 'email' });

  const onSubmit = handleSubmit((values) =>
    createInvite
      .mutateAsync(values.email)
      .then((created) => toast.success(`Convite enviado para ${created.email}.`))
      .catch((error: unknown) =>
        setError('email', {
          type: 'server',
          message: apiErrorMessage(error, 'Não foi possível enviar o convite.'),
        }),
      ),
  );

  if (createInvite.data) {
    const { url } = createInvite.data;
    return (
      <div className="mt-4 flex flex-col gap-3">
        <p className="text-sm">Convite criado. Se o e-mail não chegar, passe este link:</p>
        <code className="bg-muted break-all rounded-md p-3 text-xs">{url}</code>
        <div className="border-border bg-muted/40 -mx-6 -mb-6 mt-2 flex justify-end gap-2 border-t p-4">
          <Button
            variant="outline"
            onClick={() => void copy(url, 'Link do convite copiado.', 'invite')}
          >
            {copiedKey === 'invite' ? (
              <Check className="mr-2 h-4 w-4 text-success" aria-hidden="true" />
            ) : (
              <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {copiedKey === 'invite' ? 'Link copiado!' : 'Copiar link'}
          </Button>
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </div>
    );
  }

  return (
    <form noValidate className="mt-4 flex flex-col gap-4" onSubmit={onSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="inviteEmail">E-mail</Label>
        <Input
          id="inviteEmail"
          type="email"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'inviteEmail-error' : undefined}
          {...register('email')}
        />
        {errors.email ? (
          <p id="inviteEmail-error" className="text-danger text-xs">
            {errors.email.message}
          </p>
        ) : null}
      </div>
      <div className="border-border bg-muted/40 -mx-6 -mb-6 mt-5 flex justify-end gap-2 border-t p-4">
        <Button variant="ghost" type="button" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={createInvite.isPending || !email.trim()}>
          {createInvite.isPending ? 'Enviando...' : 'Enviar convite'}
        </Button>
      </div>
    </form>
  );
}
