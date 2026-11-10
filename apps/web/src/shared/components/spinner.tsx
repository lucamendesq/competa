import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn('inline-flex text-[length:--spacing(4)] motion-safe:animate-spin', className)}
      aria-label="Carregando"
      role="status"
    />
  );
}
