import { Link } from 'react-router';
import { cn } from '@/shared/lib/cn';

export function TermsConsent({ action, className }: { action: string; className?: string }) {
  return (
    <p className={cn('text-muted-foreground text-xs', className)}>
      {action}, você aceita os{' '}
      <Link to="/termos" target="_blank" className="text-foreground underline">
        Termos de Uso
      </Link>{' '}
      e a{' '}
      <Link to="/privacidade" target="_blank" className="text-foreground underline">
        Política de Privacidade
      </Link>
      .
    </p>
  );
}
