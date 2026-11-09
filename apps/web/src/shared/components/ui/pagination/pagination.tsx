import { ChevronLeftIcon, ChevronRightIcon, EllipsisIcon } from 'lucide-react';
import { buttonVariants } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/cn';

type PageItem = { type: 'page'; value: number } | { type: 'ellipsis'; key: string };

const range = (start: number, end: number): PageItem[] =>
  Array.from({ length: end - start + 1 }, (_, index) => ({ type: 'page', value: start + index }));

export const pageItems = (page: number, pageCount: number, siblingCount = 1): PageItem[] => {
  const visibleSlots = siblingCount * 2 + 5;
  if (pageCount <= visibleSlots) return range(1, pageCount);

  const left = Math.max(page - siblingCount, 1);
  const right = Math.min(page + siblingCount, pageCount);
  const showLeftEllipsis = left > 3;
  const showRightEllipsis = right < pageCount - 2;
  const edgeRun = 3 + siblingCount * 2;

  if (!showLeftEllipsis) {
    return [
      ...range(1, edgeRun),
      { type: 'ellipsis', key: 'right' },
      ...range(pageCount, pageCount),
    ];
  }
  if (!showRightEllipsis) {
    return [
      ...range(1, 1),
      { type: 'ellipsis', key: 'left' },
      ...range(pageCount - edgeRun + 1, pageCount),
    ];
  }
  return [
    ...range(1, 1),
    { type: 'ellipsis', key: 'left' },
    ...range(left, right),
    { type: 'ellipsis', key: 'right' },
    ...range(pageCount, pageCount),
  ];
};

type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  className?: string;
  label?: string;
};

const stepClass = cn(
  buttonVariants({ variant: 'ghost', size: 'default' }),
  'gap-1 px-2.5 sm:pr-2.5',
);

export function Pagination({
  page,
  pageCount,
  onPageChange,
  siblingCount = 1,
  className,
  label = 'Paginação',
}: PaginationProps) {
  return (
    <nav
      aria-label={label}
      data-slot="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
    >
      <ul data-slot="pagination-content" className="flex flex-row items-center gap-1">
        <li>
          <button
            type="button"
            data-slot="pagination-previous"
            aria-label="Página anterior"
            className={stepClass}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeftIcon aria-hidden="true" />
            <span className="hidden sm:block">Anterior</span>
          </button>
        </li>
        {pageItems(page, pageCount, siblingCount).map((item) =>
          item.type === 'page' ? (
            <li key={item.value}>
              <button
                type="button"
                data-slot="pagination-item"
                aria-current={item.value === page ? 'page' : undefined}
                className={buttonVariants({
                  variant: item.value === page ? 'outline' : 'ghost',
                  size: 'icon',
                })}
                onClick={() => onPageChange(item.value)}
              >
                {item.value}
              </button>
            </li>
          ) : (
            <li
              key={item.key}
              data-slot="pagination-ellipsis"
              className="flex size-9 items-center justify-center"
            >
              <EllipsisIcon className="size-4" aria-hidden="true" />
              <span className="sr-only">Mais páginas</span>
            </li>
          ),
        )}
        <li>
          <button
            type="button"
            data-slot="pagination-next"
            aria-label="Próxima página"
            className={stepClass}
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            <span className="hidden sm:block">Próxima</span>
            <ChevronRightIcon aria-hidden="true" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
