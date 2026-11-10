import { useState } from 'react';
import { CircleCheck } from 'lucide-react';
import type { Contact } from '@/features/companies/api/company.types';
import { RevokeAccessDialog } from '@/features/companies/components/revoke-access-dialog';
import { useCompanyAccesses } from '@/features/companies/queries/use-company-queries';
import { Button } from '@/shared/components/ui/button';

export function ContactAccessList({ companyId }: { companyId: string }) {
  const accesses = useCompanyAccesses(companyId);
  const [confirmRevoke, setConfirmRevoke] = useState<Contact | null>(null);

  if (!accesses.data?.length) return null;

  return (
    <div className="border-border border-t pt-5">
      <h3 className="text-sm font-semibold text-foreground">Acesso ao app</h3>
      <p className="text-muted-foreground mt-1 text-xs leading-5">
        Quem tem conta vê as pendências desta empresa e envia documentos pela Minha Área. Revogar
        corta a conta e o link de envio atual; o próximo link enviado volta a valer.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {accesses.data.map((contact) => (
          <li
            key={contact.id}
            className="border-border/60 bg-sunken/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <CircleCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                {contact.name}
              </p>
              <p className="text-muted-foreground text-xs">{contact.email}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger hover:text-danger hover:bg-danger/10"
              onClick={() => setConfirmRevoke(contact)}
            >
              Revogar acesso
            </Button>
          </li>
        ))}
      </ul>
      <RevokeAccessDialog
        companyId={companyId}
        contact={confirmRevoke}
        onOpenChange={(open) => {
          if (!open) setConfirmRevoke(null);
        }}
      />
    </div>
  );
}
