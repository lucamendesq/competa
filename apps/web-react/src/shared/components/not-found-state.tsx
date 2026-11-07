import { Link } from 'react-router';
import { Button } from '@/shared/components/ui/button';

export function NotFoundState({
  title,
  to,
  backLabel,
}: {
  title: string;
  to: string;
  backLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center" role="alert">
      <p className="text-foreground text-base font-medium">{title}</p>
      <p className="text-muted-foreground max-w-md text-sm">
        O endereço pode estar errado ou o registro não existe mais.
      </p>
      <Button variant="outline" className="mt-1 shadow-xs" asChild>
        <Link to={to}>{backLabel}</Link>
      </Button>
    </div>
  );
}
