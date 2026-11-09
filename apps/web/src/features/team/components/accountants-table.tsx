import { Trash2 } from 'lucide-react';
import type { TeamAccountant } from '@/features/team/api/team.types';
import { StatusPill } from '@/shared/components/status-pill';
import { Button } from '@/shared/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';

type AccountantsTableProps = {
  accountants: TeamAccountant[];
  isOwner: boolean;
  onRemove: (accountant: TeamAccountant) => void;
};

export function AccountantsTable({ accountants, isOwner, onRemove }: AccountantsTableProps) {
  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accountants.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium text-foreground">{row.name}</TableCell>
                <TableCell className="text-muted-foreground">{row.email}</TableCell>
                <TableCell>
                  <StatusPill
                    status={row.owner ? 'active' : 'neutral'}
                    text={row.owner ? 'Dono' : 'Contador'}
                  />
                </TableCell>
                <TableCell className="text-right">
                  {isOwner && !row.owner ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-700 hover:text-rose-800 hover:bg-rose-50"
                      aria-label={`Remover ${row.name}`}
                      onClick={() => onRemove(row)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Remover
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
