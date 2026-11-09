import { Search } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { CATEGORY_LABEL } from '@/shared/lib/format';

export type CatalogDocument = {
  id: string;
  name: string;
  category: string;
  acceptedFormats: string[];
};

type CatalogPickerProps = {
  documents: CatalogDocument[];
  search: string;
  onSearchChange: (value: string) => void;
  onAdd: (document: CatalogDocument) => void;
  searchId?: string;
  emptyLabel?: string;
  acting?: boolean;
};

export const filterCatalog = (
  documents: CatalogDocument[],
  excludedIds: ReadonlySet<string>,
  search: string,
) => {
  const term = search.trim().toLowerCase();
  return documents.filter(
    (document) =>
      !excludedIds.has(document.id) && (!term || document.name.toLowerCase().includes(term)),
  );
};

export function CatalogPicker({
  documents,
  search,
  onSearchChange,
  onAdd,
  searchId = 'search-catalog',
  emptyLabel = 'Nenhum documento do catálogo fora desta lista.',
  acting = false,
}: CatalogPickerProps) {
  return (
    <div>
      <div className="relative">
        <Label className="sr-only" htmlFor={searchId}>
          Buscar documento no catálogo
        </Label>
        <Input
          id={searchId}
          type="search"
          className="pl-9"
          placeholder="Buscar documento"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <Search
          className="text-muted-foreground pointer-events-none absolute top-3 left-3 size-4 md:top-2.5"
          aria-hidden="true"
        />
      </div>

      {documents.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">{emptyLabel}</p>
      ) : (
        <ul className="divide-border mt-4 divide-y">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{document.name}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {CATEGORY_LABEL[document.category]} &middot; {document.acceptedFormats.join(', ')}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={acting}
                aria-label={`Adicionar ${document.name}`}
                onClick={() => onAdd(document)}
              >
                Adicionar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
