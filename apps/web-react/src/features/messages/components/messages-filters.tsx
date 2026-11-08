import {
  MESSAGE_CHANNELS,
  MESSAGE_PURPOSES,
  MESSAGE_STATUS,
  type MessageListQuery,
} from '@competa/contracts';
import type { CompanyFilterOption } from '@/features/messages/api/message.types';
import {
  CHANNEL_LABEL,
  PURPOSE_LABEL,
  STATUS_LABEL,
} from '@/features/messages/components/message-labels';
import type { FilterField } from '@/features/messages/components/message-query';

const SELECT_CLASS =
  'flex h-10 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary text-foreground';

type MessagesFiltersProps = {
  query: MessageListQuery;
  companies: CompanyFilterOption[];
  onChange: (field: FilterField, value: string) => void;
};

export function MessagesFilters({ query, companies, onChange }: MessagesFiltersProps) {
  return (
    <div className="mb-6 flex flex-wrap gap-3">
      <select
        aria-label="Empresa"
        className={SELECT_CLASS}
        value={query.companyId ?? ''}
        onChange={(event) => onChange('companyId', event.target.value)}
      >
        <option value="">Todas as empresas</option>
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Canal"
        className={SELECT_CLASS}
        value={query.channel ?? ''}
        onChange={(event) => onChange('channel', event.target.value)}
      >
        <option value="">Todos os canais</option>
        {MESSAGE_CHANNELS.map((value) => (
          <option key={value} value={value}>
            {CHANNEL_LABEL[value]}
          </option>
        ))}
      </select>
      <select
        aria-label="Tipo"
        className={SELECT_CLASS}
        value={query.purpose ?? ''}
        onChange={(event) => onChange('purpose', event.target.value)}
      >
        <option value="">Todos os tipos</option>
        {MESSAGE_PURPOSES.map((value) => (
          <option key={value} value={value}>
            {PURPOSE_LABEL[value]}
          </option>
        ))}
      </select>
      <select
        aria-label="Status"
        className={SELECT_CLASS}
        value={query.status ?? ''}
        onChange={(event) => onChange('status', event.target.value)}
      >
        <option value="">Todos os status</option>
        {MESSAGE_STATUS.map((value) => (
          <option key={value} value={value}>
            {STATUS_LABEL[value]}
          </option>
        ))}
      </select>
    </div>
  );
}
