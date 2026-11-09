import { IMPORT_COLUMNS } from '@/features/companies/utils/spreadsheet';

export function ImportColumns() {
  return (
    <aside className="bg-card border-border h-fit rounded-xl border shadow-sm overflow-hidden">
      <div className="bg-sunken/60 border-border border-b p-4">
        <h2 className="text-sm font-semibold font-display text-foreground">Colunas esperadas</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          A primeira linha da planilha precisa ter estes nomes de coluna (variações como "Razão
          Social", "E-mail do responsável" e "WhatsApp" também são aceitas).
        </p>
      </div>
      <ul className="divide-border divide-y">
        {IMPORT_COLUMNS.map((column) => (
          <li key={column.key} className="p-3.5 hover:bg-slate-50/75 transition-colors">
            <p className="text-sm font-semibold text-foreground">{column.header}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {column.required ? (
                <span className="text-primary font-medium">Obrigatória</span>
              ) : (
                'Opcional'
              )}
              {column.hint ? <> &middot; {column.hint}</> : null}
            </p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
