import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

export function PublicLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="bg-background min-h-dvh">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Voltar
        </Link>
        <h1 className="font-display mt-8 text-3xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <div className="mt-8 space-y-6 text-sm text-foreground/80 leading-relaxed">{children}</div>
      </div>
    </main>
  );
}
