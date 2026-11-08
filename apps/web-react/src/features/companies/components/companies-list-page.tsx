import { useState } from 'react';
import { Building2, Upload } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { CompaniesResults } from '@/features/companies/components/companies-results';
import { PlanCapBanner } from '@/features/companies/components/plan-cap-banner';
import { useCompanies, usePlanUsage } from '@/features/companies/queries/use-company-queries';
import { ErrorState } from '@/shared/components/error-state';
import { LoadingRows } from '@/shared/components/loading-rows';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/components/ui/button';
import { EmptyState } from '@/shared/components/ui/empty';
import { Input } from '@/shared/components/ui/input';
import { useDebouncedCallback } from '@/shared/hooks/use-debounced-callback';
import { cn } from '@/shared/lib/cn';

const PER_PAGE = 20;

const activeFilterOf = (value: string | null) =>
  value === 'true' || value === 'false' ? value : undefined;

export function CompaniesListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const active = activeFilterOf(searchParams.get('ativas'));
  const search = searchParams.get('busca') ?? '';
  const [searchInput, setSearchInput] = useState(search);

  const usage = usePlanUsage();
  const companies = useCompanies({
    page,
    perPage: PER_PAGE,
    ...(active ? { active } : {}),
    ...(search ? { search } : {}),
  });

  const setFilter = (key: 'ativas' | 'busca', value: string | undefined) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('page');
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  const commitSearch = useDebouncedCallback((value: string) => setFilter('busca', value), 300);

  const setPage = (next: number) =>
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('page', String(next));
      return params;
    });

  const statusChips = [
    {
      value: undefined,
      label: 'Todas',
      count: usage.data ? usage.data.companiesActive + usage.data.companiesInactive : undefined,
    },
    { value: 'true', label: 'Ativas', count: usage.data?.companiesActive },
    { value: 'false', label: 'Inativas', count: usage.data?.companiesInactive },
  ];

  const renderBody = () => {
    if (companies.isError) {
      return (
        <ErrorState
          error={companies.error}
          fallback="Não foi possível carregar."
          retry={() => void companies.refetch()}
        />
      );
    }
    if (companies.isPending) return <LoadingRows />;

    const rows = companies.data.data;
    if (rows.length === 0) {
      const filtered = Boolean(search || active);
      return (
        <EmptyState
          icon={Building2}
          title="Nenhuma empresa"
          description={
            filtered
              ? 'Nenhuma empresa corresponde ao filtro atual.'
              : 'Cadastre a primeira empresa (ou importe um CSV) para começar a cobrar documentos.'
          }
          {...(filtered
            ? {}
            : { actionLabel: 'Nova empresa', onAction: () => void navigate('/empresas/nova') })}
        />
      );
    }

    return (
      <CompaniesResults
        key={`${active ?? 'todas'}|${search}|${page}`}
        companies={rows}
        page={page}
        pageCount={Math.ceil(companies.data.meta.total / PER_PAGE)}
        onPageChange={setPage}
      />
    );
  };

  return (
    <>
      <PageHeader
        title="Empresas"
        description="Carteira de clientes ativos e inativos da contabilidade."
      >
        <Button variant="outline" className="mr-2 shadow-xs" asChild>
          <Link to="/empresas/importar">
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" /> Importar CSV
          </Link>
        </Button>
        <Button asChild className="shadow-xs font-medium">
          <Link to="/empresas/nova">
            <Building2 className="mr-2 h-4 w-4" aria-hidden="true" /> Nova empresa
          </Link>
        </Button>
      </PageHeader>

      <PlanCapBanner className="mt-6" />

      <section className="mt-8">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-80">
            <Input
              type="search"
              value={searchInput}
              placeholder="Buscar pelo nome ou CNPJ"
              className="w-full shadow-xs focus-visible:ring-ring focus-visible:border-primary"
              aria-label="Buscar empresa"
              onChange={(event) => {
                setSearchInput(event.target.value);
                commitSearch(event.target.value);
              }}
            />
          </div>
          <div
            className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0"
            role="group"
            aria-label="Status da empresa"
          >
            {statusChips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                aria-pressed={active === chip.value}
                className={cn(
                  'shrink-0 rounded-full border px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active === chip.value
                    ? 'bg-primary/10 text-primary border-primary/30 font-semibold shadow-xs'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                onClick={() => setFilter('ativas', chip.value)}
              >
                {chip.label}
                {chip.count !== undefined ? (
                  <span className="ml-1.5 tabular-nums opacity-70">{chip.count}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {renderBody()}
      </section>
    </>
  );
}
