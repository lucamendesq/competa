export function RootErrorFallback() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Algo deu errado</h1>
      <p className="text-sm text-slate-600">
        A página encontrou um erro inesperado. Recarregue para tentar de novo.
      </p>
      <button
        type="button"
        className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
        onClick={() => window.location.reload()}
      >
        Recarregar
      </button>
    </main>
  );
}
