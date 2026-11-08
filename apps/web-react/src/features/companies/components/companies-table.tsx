import { Pencil, SquareCheckBig } from 'lucide-react';
import { Link } from 'react-router';
import type { Company } from '@/features/companies/api/company.types';
import { ContactStatus } from '@/features/companies/components/contact-status';
import { InviteToAppButton } from '@/features/companies/components/invite-to-app-button';
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
import { maskedCnpj } from '@/shared/lib/format';

const CHECKBOX_CLASS = 'size-4 rounded border-border text-primary focus:ring-ring accent-primary';
const ROW_ACTION_CLASS = 'h-8 px-2 text-xs text-muted-foreground hover:text-foreground';

type CompaniesTableProps = {
  companies: Company[];
  selectedIds: ReadonlySet<string>;
  reactivating: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onDeactivate: (company: Company) => void;
  onReactivate: (company: Company) => void;
};

export function CompaniesTable({
  companies,
  selectedIds,
  reactivating,
  onToggle,
  onToggleAll,
  onDeactivate,
  onReactivate,
}: CompaniesTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-sunken/60">
          <TableRow className="hover:bg-transparent border-border">
            <TableHead className="w-12 font-semibold text-foreground">
              <input
                type="checkbox"
                className={CHECKBOX_CLASS}
                aria-label="Selecionar todas"
                checked={companies.length > 0 && selectedIds.size === companies.length}
                onChange={onToggleAll}
              />
            </TableHead>
            <TableHead className="font-semibold text-foreground">Nome</TableHead>
            <TableHead className="font-semibold text-foreground">CNPJ</TableHead>
            <TableHead className="font-semibold text-foreground">Responsável</TableHead>
            <TableHead className="font-semibold text-foreground">Template</TableHead>
            <TableHead className="font-semibold text-foreground">Status</TableHead>
            <TableHead className="text-right font-semibold text-foreground">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => (
            <TableRow
              key={company.id}
              className="border-border hover:bg-slate-50/75 transition-colors"
            >
              <TableCell>
                <input
                  type="checkbox"
                  className={CHECKBOX_CLASS}
                  aria-label={`Selecionar ${company.name}`}
                  checked={selectedIds.has(company.id)}
                  onChange={() => onToggle(company.id)}
                />
              </TableCell>
              <TableCell className="font-medium font-display text-foreground min-w-40 whitespace-normal break-words">
                <Link
                  to={`/empresas/${company.id}/editar`}
                  className="hover:text-primary transition-colors hover:underline"
                >
                  {company.name}
                </Link>
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground text-xs sm:text-sm">
                {company.cnpj ? maskedCnpj(company.cnpj) : '—'}
              </TableCell>
              <TableCell className="min-w-40 whitespace-normal">
                <ContactStatus company={company} />
              </TableCell>
              <TableCell className="whitespace-normal">
                {company.templateName ? (
                  <Link
                    to={`/empresas/${company.id}/checklist`}
                    className="text-foreground hover:text-primary transition-colors hover:underline text-sm font-medium"
                  >
                    {company.templateName}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-surface px-2.5 py-0.5 text-[11px] font-semibold text-warning-foreground">
                    Sem template
                  </span>
                )}
              </TableCell>
              <TableCell>
                <StatusPill status={company.active ? 'active' : 'inactive'} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" asChild className={ROW_ACTION_CLASS}>
                    <Link to={`/empresas/${company.id}/editar`}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Editar
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild className={ROW_ACTION_CLASS}>
                    <Link to={`/empresas/${company.id}/checklist`}>
                      <SquareCheckBig className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Checklist
                    </Link>
                  </Button>
                  {company.contactCount && !company.readyContactCount ? (
                    <InviteToAppButton company={company} />
                  ) : null}
                  {company.active ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => onDeactivate(company)}
                    >
                      Desativar
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-primary"
                      disabled={reactivating}
                      onClick={() => onReactivate(company)}
                    >
                      Reativar
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
