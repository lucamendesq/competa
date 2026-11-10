import type { ReactNode } from 'react';
import { CircleAlert, type LucideIcon } from 'lucide-react';
import { Logo } from '@/shared/components/logo';

export type Benefit = { icon: LucideIcon; title: string; text: string };

type AuthShellProps = {
  headline: string;
  summary: string;
  benefits: Benefit[];
  children: ReactNode;
};

export function AuthShell({ headline, summary, benefits, children }: AuthShellProps) {
  return (
    <div className="bg-background min-h-dvh lg:grid lg:grid-cols-2">
      <aside
        aria-label="Sobre o Competa"
        className="bg-[#0F172A] text-white hidden flex-col justify-center p-12 lg:flex"
      >
        <Logo surface="dark" className="h-10 text-white" />
        <p className="font-display mt-6 max-w-md text-3xl font-semibold tracking-tight">
          {headline}
        </p>
        <p className="mt-3 max-w-md text-sm opacity-80">{summary}</p>
        <ul className="mt-10 flex max-w-md flex-col gap-6">
          {benefits.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-4">
              <span
                className="bg-white/10 text-amber-400 flex size-9 shrink-0 items-center justify-center rounded-lg"
                aria-hidden="true"
              >
                <Icon className="text-base h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="mt-0.5 block text-sm opacity-75">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex min-h-dvh items-center justify-center p-4 sm:p-8">
        <div className="bg-card border-border w-full max-w-md rounded-xl border p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex justify-center lg:hidden">
            <Logo className="h-8" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

export function RequiredMark() {
  return (
    <>
      <span className="text-destructive" aria-hidden="true">
        *
      </span>
      <span className="sr-only">(obrigatório)</span>
    </>
  );
}

export function FormAlert({ message }: { message: string }) {
  return (
    <div
      className="flex gap-3 rounded-lg border border-danger-border bg-danger-surface p-3 text-sm text-danger-foreground"
      role="alert"
    >
      <CircleAlert className="mt-0.5 shrink-0 text-base h-4 w-4" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="bg-background min-h-dvh flex items-center justify-center p-4 sm:p-8">
      <div className="bg-card border-border w-full max-w-md rounded-xl border p-6 shadow-sm sm:p-8">
        <div className="flex justify-center mb-6">
          <Logo surface="auto" className="h-8" />
        </div>
        {children}
      </div>
    </main>
  );
}

export function StatusIcon({
  tone,
  children,
}: {
  tone: 'primary' | 'danger';
  children: ReactNode;
}) {
  return (
    <div
      className={
        tone === 'primary'
          ? 'mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary'
          : 'mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-danger-surface text-danger-foreground'
      }
      aria-hidden="true"
    >
      {children}
    </div>
  );
}
