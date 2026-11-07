import type { CSSProperties } from 'react';
import {
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  Loader2Icon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { cn } from '@/shared/lib/cn';

export function Toaster({ className, ...props }: ToasterProps) {
  return (
    <Sonner
      className={cn('toaster group', className)}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as CSSProperties
      }
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <CircleXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
        close: <XIcon className="size-4" />,
      }}
      {...props}
    />
  );
}
