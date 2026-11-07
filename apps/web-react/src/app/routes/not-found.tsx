import { Link, useLocation } from 'react-router';
import { Logo } from '@/shared/components/logo';
import { Button } from '@/shared/components/ui/button';
import { useSession, type Session } from '@/shared/session';

const homeFor = (session: Session) => {
  if (session.accountant) return { to: '/competencias', label: 'Ir para o painel' };
  if (session.contact) return { to: '/minha-area/pendencias', label: 'Ir para minhas pendências' };
  return { to: '/entrar', label: 'Entrar' };
};

export function NotFoundPage() {
  const location = useLocation();
  const session = useSession();
  const home = homeFor(session);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo className="h-8" />
      <p className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
        Erro 404
      </p>
      <h1 className="text-2xl font-bold tracking-tight">Página não encontrada</h1>
      <p className="text-muted-foreground text-sm">
        O endereço{' '}
        <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
          {location.pathname}
          {location.search}
          {location.hash}
        </code>{' '}
        não existe.
      </p>
      {session.status === 'ready' ? (
        <Button asChild>
          <Link to={home.to}>{home.label}</Link>
        </Button>
      ) : null}
    </main>
  );
}
