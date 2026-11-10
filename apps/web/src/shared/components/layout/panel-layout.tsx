import { useState, type ReactNode } from 'react';
import {
  Building2,
  CalendarRange,
  ChevronDown,
  LogOut,
  Mail,
  Menu,
  Settings,
  SquareCheckBig,
  X,
} from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { Callout } from '@/shared/components/callout';
import { Logo } from '@/shared/components/logo';
import { cn } from '@/shared/lib/cn';

const NAV = [
  { path: '/competencias', label: 'Competências', icon: CalendarRange },
  { path: '/empresas', label: 'Empresas', icon: Building2 },
  { path: '/templates', label: 'Checklists', icon: SquareCheckBig },
  { path: '/mensagens', label: 'Mensagens', icon: Mail },
  { path: '/configuracoes/contabilidade', label: 'Contabilidade', icon: Settings },
  { path: '/configuracoes/whatsapp', label: 'WhatsApp', icon: Settings },
  { path: '/configuracoes/plano', label: 'Plano e Assinatura', icon: SquareCheckBig },
];

const focusRing = 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

const initialsOf = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export type PanelLayoutProps = {
  firmName: string;
  accountantName: string;
  accountantEmail: string;
  isOwner: boolean;
  isOverdue: boolean;
  busy: boolean;
  onSignOut: () => void;
  children: ReactNode;
};

export function PanelLayout({
  firmName,
  accountantName,
  accountantEmail,
  isOwner,
  isOverdue,
  busy,
  onSignOut,
  children,
}: PanelLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const firmLabel = firmName || 'Contabilidade';

  const closeMenus = () => {
    setProfileOpen(false);
    setMenuOpen(false);
  };

  return (
    <div className="bg-background min-h-dvh lg:flex">
      <a
        href="#conteudo"
        className={cn(
          'bg-primary text-primary-foreground sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:px-3 focus:py-2 focus:text-sm font-medium',
          focusRing,
        )}
      >
        Pular para o conteúdo
      </a>

      <header className="bg-white border-b border-border text-slate-900 sticky top-0 z-40 flex h-14 items-center gap-3 px-4 lg:hidden">
        <button
          type="button"
          className={cn(
            'text-slate-600 hover:text-slate-900 hover:bg-slate-100 inline-flex size-9 items-center justify-center rounded-lg transition-colors',
            focusRing,
          )}
          aria-expanded={menuOpen}
          aria-controls="menu-lateral"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span className="sr-only">{menuOpen ? 'Fechar menu' : 'Abrir menu'}</span>
          {menuOpen ? (
            <X className="size-5" aria-hidden="true" />
          ) : (
            <Menu className="size-5" aria-hidden="true" />
          )}
        </button>
        <div className="h-4 w-px bg-border" aria-hidden="true" />
        <p className="truncate text-sm font-semibold text-slate-900">{firmLabel}</p>
      </header>

      {menuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <nav
        id="menu-lateral"
        className={cn(
          'bg-white text-slate-900 border-r border-border fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col transition-[translate,visibility] lg:visible lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          !menuOpen && 'invisible -translate-x-full',
        )}
        aria-label="Navegação principal"
      >
        <div className="border-b border-border flex h-14 items-center gap-2.5 px-4 lg:h-16">
          <Logo variant="icon" surface="auto" alt="" className="h-8 shrink-0" />
          <p className="truncate text-sm font-semibold text-slate-900">{firmLabel}</p>
        </div>

        <ul className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {NAV.map(({ path, label, icon: Icon }) => (
            <li key={path}>
              <NavLink
                to={path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors',
                    focusRing,
                    isActive && 'bg-brand-light text-brand-strong font-semibold',
                  )
                }
                onClick={() => setMenuOpen(false)}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="border-border relative border-t p-3">
          <button
            type="button"
            className={cn(
              'hover:bg-slate-100 flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors',
              focusRing,
            )}
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen(!profileOpen)}
          >
            <span
              className="bg-amber-100 text-amber-900 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              aria-hidden="true"
            >
              {initialsOf(accountantName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {accountantName}
              </span>
              <span className="block truncate text-xs text-slate-600">{accountantEmail}</span>
            </span>
            <ChevronDown className="size-4 text-slate-500 shrink-0" aria-hidden="true" />
          </button>

          {profileOpen ? (
            <div className="bg-white text-slate-900 border-border absolute bottom-16 left-3 right-3 rounded-xl border p-1 shadow-lg z-50">
              {isOwner ? (
                <Link
                  to="/configuracoes/contadores"
                  className={cn(
                    'hover:bg-slate-100 flex h-9 items-center rounded-lg px-3 text-sm text-slate-700 hover:text-slate-900 transition-colors',
                    focusRing,
                  )}
                  onClick={closeMenus}
                >
                  Convidar contador
                </Link>
              ) : null}
              <button
                type="button"
                className={cn(
                  'hover:bg-slate-100 flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-700 hover:text-slate-900 transition-colors',
                  focusRing,
                )}
                onClick={onSignOut}
              >
                <LogOut className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
                Sair
              </button>
            </div>
          ) : null}
        </div>
      </nav>

      <main id="conteudo" className="min-w-0 flex-1 flex flex-col" aria-busy={busy || undefined}>
        <div className="mx-auto flex max-w-[1600px] flex-col gap-6 w-full p-4 sm:p-6">
          {isOverdue ? (
            <Callout
              tone="danger"
              heading="Sua assinatura está pendente"
              actions={
                <Link
                  to="/configuracoes/plano"
                  className={cn(
                    'self-center rounded-md border border-danger-border px-3 py-1.5 text-sm font-semibold whitespace-nowrap underline-offset-2 hover:underline',
                    focusRing,
                  )}
                >
                  Regularizar agora
                </Link>
              }
            >
              <p>O acesso de escrita foi bloqueado até a regularização.</p>
            </Callout>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  );
}
