import type { ReactNode } from 'react';
import { CircleCheck, Info, Lock, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

export type CalloutTone = 'danger' | 'warning' | 'success' | 'info' | 'neutral';

const TONE_CLASS: Record<CalloutTone, string> = {
  danger: 'border-danger-border bg-danger-surface text-danger-foreground',
  warning: 'border-warning-border bg-warning-surface text-warning-foreground',
  success: 'border-success-border bg-success-surface text-success-foreground',
  info: 'border-info-border bg-info-surface text-info-foreground',
  neutral: 'border-border bg-muted text-foreground',
};

const TONE_ICON: Record<CalloutTone, LucideIcon> = {
  danger: TriangleAlert,
  warning: TriangleAlert,
  success: CircleCheck,
  info: Info,
  neutral: Lock,
};

type CalloutProps = {
  tone?: CalloutTone;
  heading?: ReactNode;
  icon?: LucideIcon | 'none';
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export function Callout({
  tone = 'info',
  heading,
  icon,
  actions,
  className,
  children,
}: CalloutProps) {
  const Icon = icon === 'none' ? null : (icon ?? TONE_ICON[tone]);

  return (
    <div
      className={cn('flex gap-3 rounded-lg border p-3', TONE_CLASS[tone], className)}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0 flex-1 text-sm">
        {heading ? <p className="font-semibold">{heading}</p> : null}
        {children}
      </div>
      {actions}
    </div>
  );
}
