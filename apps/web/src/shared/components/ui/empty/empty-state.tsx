import type { ComponentType, ReactNode } from 'react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/cn';

type EmptyStateProps = {
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  media?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
};

export function EmptyState({
  className,
  title,
  description,
  icon: Icon,
  media,
  actionLabel,
  onAction,
  children,
}: EmptyStateProps) {
  const visual = media ?? (Icon ? <Icon className="h-6 w-6" aria-hidden /> : null);

  return (
    <div
      className={cn(
        'gap-4 rounded-xl border border-dashed border-border bg-card p-12 flex w-full min-w-0 flex-1 flex-col items-center justify-center text-center text-balance',
        className,
      )}
    >
      {visual ? (
        <div className="text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          {visual}
        </div>
      ) : null}
      <div className="space-y-1">
        {title ? <h2 className="text-lg font-medium tracking-tight">{title}</h2> : null}
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children ??
        (actionLabel ? (
          <Button className="shadow-xs font-medium" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null)}
    </div>
  );
}
