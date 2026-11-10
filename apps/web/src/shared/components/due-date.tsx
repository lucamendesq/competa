import { dateBr, isOverdue } from '@/shared/lib/format';

export function DueDate({ date }: { date: string | null }) {
  if (!date) return <span className="text-muted-foreground text-xs">—</span>;
  if (isOverdue(date))
    return <span className="font-semibold text-danger">Atrasado {dateBr(date)}</span>;
  return <span className="text-muted-foreground text-xs">Vence {dateBr(date)}</span>;
}
