import type { ReactNode } from 'react';
import { ClipboardList, History, KeyRound, LogOut } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { Logo } from '@/shared/components/logo';
import { cn } from '@/shared/lib/cn';
import { InstallButton } from '@/shared/pwa';
import type { ContactSession } from '@/shared/session';

const NAV = [
  { path: '/minha-area/pendencias', label: 'O que falta', icon: ClipboardList },
  { path: '/minha-area/competencias', label: 'Histórico', icon: History },
] as const;

const HEADER_ACTION =
  'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none';

type ContactLayoutProps = {
  contact: ContactSession | null;
  onSignOut: () => void;
  children: ReactNode;
};

export function ContactLayout({ contact, onSignOut, children }: ContactLayoutProps) {
  const multiCompany = (contact?.companies.length ?? 0) > 1;

  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="bg-primary text-primary-foreground sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:px-3 focus:py-2 focus:text-sm"
      >
        Pular para o conteúdo
      </a>

      {contact ? (
        <header className="bg-card border-border sticky top-0 z-40 border-b">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            <Logo variant="icon" surface="auto" alt="" className="h-6 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-sm font-semibold">
                {multiCompany ? contact.name : contact.companyName}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {multiCompany
                  ? `${contact.companies.length} empresas · ${contact.accountingFirmName}`
                  : contact.accountingFirmName}
              </p>
            </div>
            <InstallButton variant="card" />
            {contact.hasPassword === false ? (
              <Link to="/minha-area/definir-senha" className={HEADER_ACTION}>
                <KeyRound className="size-3.5" aria-hidden="true" />
                Criar senha
              </Link>
            ) : null}
            <button type="button" className={HEADER_ACTION} onClick={onSignOut}>
              <LogOut className="size-3.5" aria-hidden="true" />
              Sair
            </button>
          </div>

          <nav className="border-border hidden border-t sm:block" aria-label="Navegação">
            <ul className="mx-auto flex max-w-3xl gap-1 px-2">
              {NAV.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring flex h-11 items-center gap-2 border-b-2 border-transparent px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
                        isActive && 'border-primary text-primary font-semibold',
                      )
                    }
                  >
                    <item.icon className="size-4" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </header>
      ) : null}

      <main id="conteudo" className="mx-auto w-full max-w-3xl flex-1 p-4 pb-24 sm:pb-6">
        {children}
      </main>

      {contact ? (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card shadow-lg sm:hidden"
          aria-label="Navegação"
        >
          <ul className="flex">
            {NAV.map((item) => (
              <li key={item.path} className="flex-1">
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      'text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] focus-visible:ring-2 focus-visible:outline-none transition-colors',
                      isActive && 'text-primary font-semibold',
                    )
                  }
                >
                  <item.icon className="size-5" aria-hidden="true" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
