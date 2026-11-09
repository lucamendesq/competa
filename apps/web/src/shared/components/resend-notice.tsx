import { itemRejections } from '@/shared/lib/item-status';

type ItemWithRejections = Parameters<typeof itemRejections>[0];

export function ResendNotice({ item, hint }: { item: ItemWithRejections; hint?: string }) {
  return (
    <span className="border-danger-border bg-danger-surface mt-2 block rounded-lg border p-3">
      <span className="text-danger-foreground block text-sm font-semibold">Precisa reenviar</span>
      {itemRejections(item).map((rejection, index) => (
        <span key={index} className="text-danger-foreground mt-1 block text-xs">
          {rejection.fileName ? `${rejection.fileName}: ` : null}
          {rejection.rejectionReason}
        </span>
      ))}
      {hint ? <span className="text-danger-foreground mt-2 block text-xs">{hint}</span> : null}
    </span>
  );
}
