import { CircleCheck, Mail, MailX } from 'lucide-react';
import type { Company } from '@/features/companies/api/company.types';

export function ContactStatus({ company }: { company: Company }) {
  const [first] = company.contacts;
  if (!company.contactCount || !first) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-danger-border bg-danger-surface px-2.5 py-0.5 text-[11px] font-semibold text-danger-foreground">
        <MailX className="h-3 w-3" aria-hidden="true" /> Sem Responsável
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-foreground">{first.name}</span>
        {company.readyContactCount ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-success-border bg-success-surface px-1.5 py-0.5 text-[10px] font-semibold text-success-foreground">
            <CircleCheck className="h-2.5 w-2.5" aria-hidden="true" /> App
          </span>
        ) : (
          <span
            className="text-muted-foreground border-border bg-muted/60 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
            title="O Responsável envia pelo link, sem conta. A conta é opcional."
          >
            <Mail className="h-2.5 w-2.5" aria-hidden="true" /> Link
          </span>
        )}
      </div>
      <span className="text-muted-foreground text-xs break-all">{first.email}</span>
      {company.contacts.length > 1 ? (
        <span className="text-muted-foreground text-[10px]">
          +{company.contacts.length - 1} outro(s)
        </span>
      ) : null}
    </div>
  );
}
