import { Link2Off } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/shared/components/ui/button';

export function LinkTemporarilyUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center p-6 text-center">
      <h1 className="font-display text-xl font-semibold tracking-tight">
        Não foi possível abrir agora
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Seu link continua valendo. Aguarde um minuto e tente de novo.
      </p>
      <Button className="mt-6" variant="outline" onClick={onRetry}>
        Tentar de novo
      </Button>
    </main>
  );
}

export function LinkExpired() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center p-6 text-center">
      <Link2Off className="text-muted-foreground h-16 w-16" aria-hidden="true" />
      <h1 className="font-display mt-4 text-xl font-semibold tracking-tight">
        Link indisponível ou expirado
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Este link de envio expirou ou foi substituído por um mais novo. Informe seu e-mail e
        enviamos o link atual para você.
      </p>
      <Button className="mt-6" asChild>
        <Link to="/perdi-meu-link">Receber o link atual</Link>
      </Button>
      <Link
        to="/minha-area/acesso"
        className="text-muted-foreground hover:text-foreground mt-4 text-sm font-medium hover:underline"
      >
        Já tem acesso? Entrar na Minha Área
      </Link>
    </main>
  );
}
