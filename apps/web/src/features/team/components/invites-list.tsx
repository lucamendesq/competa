import { Mail } from 'lucide-react';
import type { PendingInvite } from '@/features/team/api/team.types';
import { Button } from '@/shared/components/ui/button';
import { dateTimeBr } from '@/shared/lib/format';

type InvitesListProps = {
  invites: PendingInvite[];
  isOwner: boolean;
  onRevoke: (invite: PendingInvite) => void;
};

export function InvitesList({ invites, isOwner, onRevoke }: InvitesListProps) {
  if (invites.length === 0) {
    return (
      <div className="border-border rounded-xl border-2 border-dashed p-8 text-center text-sm text-muted-foreground bg-card/50">
        Nenhum convite aguardando aceite.
      </div>
    );
  }
  return (
    <ul className="bg-card border-border divide-border divide-y rounded-xl border shadow-sm">
      {invites.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> {row.email}
            </p>
            <p className="text-muted-foreground text-xs mt-0.5">
              Expira em {dateTimeBr(row.expiresAt)}
            </p>
          </div>
          {isOwner ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-rose-700 hover:text-rose-800 hover:bg-rose-50"
              aria-label={`Revogar convite de ${row.email}`}
              onClick={() => onRevoke(row)}
            >
              Revogar
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
