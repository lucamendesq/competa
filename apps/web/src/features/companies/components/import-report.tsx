import { CircleCheck, Mail } from 'lucide-react';
import type { PlanUsage } from '@/features/companies/api/company.types';
import type { InvitesSent, splitOf } from '@/features/companies/components/import-state';
import { Button } from '@/shared/components/ui/button';

type ActivationSplitProps = {
  split: ReturnType<typeof splitOf>;
  usage: PlanUsage | undefined;
  onActivateChange: (activate: boolean) => void;
};

export function ActivationSplit({ split, usage, onActivateChange }: ActivationSplitProps) {
  return (
    <div className="border-border bg-card shadow-xs flex flex-col gap-3 rounded-xl border p-4 sm:p-5">
      <p className="text-foreground text-sm">
        <strong>{split.ready}</strong>{' '}
        {split.ready === 1 ? 'empresa será importada' : 'empresas serão importadas'}.{' '}
        {split.updating ? (
          <>
            <strong>{split.updating}</strong>{' '}
            {split.updating === 1
              ? 'já está cadastrada e terá os dados substituídos pelos da planilha'
              : 'já estão cadastradas e terão os dados substituídos pelos da planilha'}
            , sem ocupar vaga nova.{' '}
          </>
        ) : null}
        {usage && split.fresh ? (
          <>
            {split.updating ? 'Das novas, ' : null}
            <strong>{split.active}</strong> {split.active === 1 ? 'ficará ativa' : 'ficarão ativas'}{' '}
            (seu plano cobre {usage.companyCap} e você já tem {usage.companiesActive}) e{' '}
            <strong>{split.inactive}</strong>{' '}
            {split.inactive === 1 ? 'ficará inativa' : 'ficarão inativas'} — ative quando quiser.
          </>
        ) : null}
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={split.activate}
          onChange={(event) => onActivateChange(event.target.checked)}
          className="accent-primary focus-visible:ring-ring mt-0.5 size-4 focus-visible:ring-2 focus-visible:outline-none"
        />
        <span className="text-muted-foreground">
          Ativar as que couberem no teto do plano. Desmarque para{' '}
          <strong>importar a carteira inteira como inativa</strong> — empresa inativa não ocupa vaga
          e não entra no disparo da competência.
        </span>
      </label>
    </div>
  );
}

type InvitesPanelProps = {
  invites: InvitesSent | null;
  confirmed: boolean;
  count: number;
  busy: boolean;
  inviting: boolean;
  onInvite: () => void;
};

export function InvitesPanel({
  invites,
  confirmed,
  count,
  busy,
  inviting,
  onInvite,
}: InvitesPanelProps) {
  return (
    <div className="border-border bg-card shadow-xs flex flex-wrap items-center gap-3 border rounded-xl p-4 sm:p-5">
      {invites === null ? (
        <>
          <p className="text-muted-foreground min-w-0 flex-1 text-xs sm:text-sm">
            A importação não avisa ninguém por e-mail — confira o relatório antes.{' '}
            {confirmed
              ? 'Envie o convite de acesso para os Responsáveis cadastrados.'
              : 'Enviar os convites agora também importa as empresas.'}
          </p>
          <Button
            variant="outline"
            disabled={busy}
            className="shadow-xs font-medium"
            onClick={onInvite}
          >
            <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
            {inviting ? 'Enviando…' : `Enviar convites de acesso (${count})`}
          </Button>
        </>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs sm:text-sm">
          <p className="flex items-center gap-2 font-medium text-success">
            <CircleCheck className="shrink-0 h-4 w-4" aria-hidden="true" />
            {invites.invited} {invites.invited === 1 ? 'convite enviado.' : 'convites enviados.'}
          </p>
          {invites.skipped.length ? (
            <ul className="text-muted-foreground pl-6">
              {invites.skipped.map((skip) => (
                <li key={skip.reason}>
                  {skip.count} sem convite — {skip.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
