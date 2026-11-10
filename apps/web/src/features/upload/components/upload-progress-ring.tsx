const ARC = 'M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831';

export function UploadProgressRing({ delivered, total }: { delivered: number; total: number }) {
  const percent = total ? Math.round((delivered / total) * 100) : 0;
  return (
    <div className="bg-card border-border mb-6 flex items-center justify-between gap-4 rounded-xl border p-4 shadow-sm">
      <div>
        <p className="text-sm font-medium">Progresso de envio</p>
        <p className="text-muted-foreground text-xs">
          {delivered} de {total} itens entregues
        </p>
      </div>
      <div className="bg-muted relative h-12 w-12 rounded-full" aria-hidden="true">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
          <path
            className="text-border"
            d={ARC}
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
          />
          <path
            className="text-primary transition-all duration-500 ease-out"
            strokeDasharray={`${percent}, 100`}
            d={ARC}
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
          />
        </svg>
      </div>
    </div>
  );
}
