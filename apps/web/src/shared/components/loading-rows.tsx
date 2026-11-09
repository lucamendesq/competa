export function LoadingRows({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2 p-4" role="status" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="bg-muted h-11 animate-pulse rounded-lg" />
      ))}
    </div>
  );
}
