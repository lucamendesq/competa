import { Bell, CheckCircle2, Lock, LogIn, PartyPopper } from 'lucide-react';
import { Link } from 'react-router';
import { TermsConsent } from '@/shared/components/terms-consent';
import { Button } from '@/shared/components/ui/button';

export function AccessEmailSent({ email }: { email: string }) {
  return (
    <div className="border-emerald-500/30 bg-emerald-500/5 mb-6 rounded-xl border p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="bg-emerald-500/10 text-emerald-600 flex size-9 shrink-0 items-center justify-center rounded-lg mt-0.5">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Link de acesso enviado!</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            Abra o email que mandamos para {email} e entre pelo link. De lá você acompanha histórico
            e pendências — e pode cadastrar uma senha, se quiser.
          </p>
        </div>
      </div>
    </div>
  );
}

type AllSentProps = {
  allAccepted: boolean;
  showOffers: boolean;
  accountExists: boolean;
  pushAvailable: boolean;
  pushSubscribing: boolean;
  activating: boolean;
  onSubscribePush: () => void;
  onActivate: () => void;
};

export function AllSentBanner({
  allAccepted,
  showOffers,
  accountExists,
  pushAvailable,
  pushSubscribing,
  activating,
  onSubscribePush,
  onActivate,
}: AllSentProps) {
  return (
    <div className="bg-primary/10 border-primary/20 mb-6 rounded-xl border p-5" role="status">
      <div className="flex items-start gap-4">
        <PartyPopper className="text-primary mt-1 shrink-0 h-6 w-6" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {allAccepted ? 'Tudo entregue e aprovado!' : 'Tudo enviado!'}
          </h2>
          <p className="mt-1 text-sm text-foreground/80">
            {allAccepted
              ? 'A contabilidade conferiu e aprovou todos os documentos deste mês.'
              : 'Agora a contabilidade confere os documentos. Se algum for recusado, o motivo aparece aqui e você reenvia pelo mesmo link.'}
          </p>
          {showOffers ? (
            <>
              <p className="mt-3 text-sm text-foreground/80">
                Quer ser lembrado mês que vem e não depender do WhatsApp?
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {accountExists ? (
                  <Button asChild>
                    <Link to="/minha-area/acesso">
                      <LogIn className="mr-2 h-4 w-4" aria-hidden="true" /> Entre na sua conta
                    </Link>
                  </Button>
                ) : (
                  <>
                    {pushAvailable ? (
                      <Button disabled={pushSubscribing} onClick={onSubscribePush}>
                        <Bell className="mr-2 h-4 w-4" aria-hidden="true" />
                        {pushSubscribing ? 'Ativando...' : 'Me avise neste aparelho'}
                      </Button>
                    ) : null}
                    <Button variant="outline" disabled={activating} onClick={onActivate}>
                      <Lock className="mr-2 h-4 w-4" aria-hidden="true" />
                      {activating ? 'Enviando…' : 'Criar meu acesso'}
                    </Button>
                  </>
                )}
              </div>
              {accountExists ? null : (
                <TermsConsent action="Ao criar seu acesso" className="mt-3" />
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AccessOfferCard({
  activating,
  onActivate,
}: {
  activating: boolean;
  onActivate: () => void;
}) {
  return (
    <div className="bg-card border-border mt-6 rounded-xl border p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg mt-0.5">
            <Lock className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Acesse quando quiser sem depender do link
            </p>
            <p className="text-muted-foreground text-xs mt-0.5">
              Mandamos um link de acesso para o seu email e você acompanha pendências e histórico na
              sua área exclusiva.
            </p>
            <TermsConsent action="Ao criar seu acesso" className="mt-1.5" />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={activating}
          onClick={onActivate}
        >
          {activating ? 'Enviando…' : 'Criar meu acesso'}
        </Button>
      </div>
    </div>
  );
}
