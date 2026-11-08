import { FileArchive, Lock } from 'lucide-react';
import { Link } from 'react-router';
import type { Period } from '@/features/periods/api/period.types';
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
import { dateTimeBr, monthLabel } from '@/shared/lib/format';

type PeriodsTableProps = {
  periods: Period[];
  canPeriodZip: boolean;
  periodZipHint: string;
  zipPendingFor: string | null;
  onDownloadZip: (period: Period) => void;
  onClose: (period: Period) => void;
};

export function PeriodsTable({
  periods,
  canPeriodZip,
  periodZipHint,
  zipPendingFor,
  onDownloadZip,
  onClose,
}: PeriodsTableProps) {
  const zipLabel = canPeriodZip ? 'Baixar .zip de todas as empresas' : periodZipHint;

  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-sunken/60">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="font-semibold text-foreground">Mês</TableHead>
              <TableHead className="font-semibold text-foreground">Status</TableHead>
              <TableHead className="font-semibold text-foreground">Abertura</TableHead>
              <TableHead className="font-semibold text-foreground">Solicitações</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.map((row) => (
              <TableRow
                key={row.id}
                className="border-border hover:bg-slate-50/75 transition-colors"
              >
                <TableCell className="font-medium font-display text-foreground">
                  <Link
                    to={`/competencias/${row.id}/pendencias`}
                    className="hover:text-primary transition-colors hover:underline"
                  >
                    {monthLabel(row.referenceMonth)}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusPill status={row.status} />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {dateTimeBr(row.createdAt)}
                </TableCell>
                <TableCell>
                  <span className="tabular-nums font-semibold text-foreground">
                    {row.requestCount}
                  </span>{' '}
                  envios
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span title={zipLabel}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hover:bg-sunken text-muted-foreground hover:text-foreground"
                        disabled={!canPeriodZip || zipPendingFor === row.id}
                        aria-label={zipLabel}
                        onClick={() => onDownloadZip(row)}
                      >
                        <FileArchive className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </span>
                    {row.status === 'open' ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-danger hover:text-danger hover:bg-danger-surface"
                        title="Encerrar"
                        aria-label={`Encerrar ${monthLabel(row.referenceMonth)}`}
                        onClick={() => onClose(row)}
                      >
                        <Lock className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
