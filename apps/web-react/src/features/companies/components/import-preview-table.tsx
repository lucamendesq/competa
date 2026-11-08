import { CircleAlert, CircleCheck, Clock } from 'lucide-react';
import type { ImportLine, ImportPreviewLine } from '@/features/companies/api/company.types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';

type DisplayLine = ImportPreviewLine | ImportLine;

function ResultBadge({ line }: { line: DisplayLine }) {
  if (line.status === 'created') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-success-border bg-success-surface px-2.5 py-0.5 text-xs font-semibold text-success">
        <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" /> Importada
      </span>
    );
  }
  if (line.status === 'pending') {
    return (
      <span className="text-muted-foreground border-border bg-muted/60 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Pronta
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-danger-border bg-danger-surface px-2.5 py-0.5 text-xs font-semibold text-danger">
      <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" /> Erro
    </span>
  );
}

const detailOf = (line: DisplayLine) => {
  if (line.status === 'error') return line.error;
  if (line.status === 'created') {
    if (!line.inserted) return 'Empresa já cadastrada, atualizada.';
    return line.active ? 'Empresa criada e ativa.' : 'Empresa criada, inativa.';
  }
  if (line.existingName) return `Vai atualizar a empresa já cadastrada ${line.existingName}.`;
  return 'Aguardando confirmação.';
};

export function ImportPreviewTable({ lines }: { lines: DisplayLine[] }) {
  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-sunken/60">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="font-semibold text-foreground">Linha</TableHead>
              <TableHead className="font-semibold text-foreground">Empresa</TableHead>
              <TableHead className="font-semibold text-foreground">Resultado</TableHead>
              <TableHead className="font-semibold text-foreground">Detalhe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow
                key={line.line}
                className="border-border hover:bg-slate-50/75 transition-colors"
              >
                <TableCell className="tabular-nums text-muted-foreground">{line.line}</TableCell>
                <TableCell className="font-medium font-display text-foreground">
                  {line.name || '—'}
                </TableCell>
                <TableCell>
                  <ResultBadge line={line} />
                </TableCell>
                <TableCell className="text-muted-foreground text-xs sm:text-sm">
                  {detailOf(line)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
