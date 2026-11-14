import type { PanelRow } from '@/features/periods/api/period.types';
import { foldAccents, isOverdue } from '@/shared/lib/format';

export type PanelLine = PanelRow & {
  awaiting: PanelRow['missing'];
  toReview: PanelRow['missing'];
  cnpj: string | null;
  total: number;
  percent: number;
  overdue: number;
};

export const STATUS_CHIPS = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Com pendência' },
  { value: 'overdue', label: 'Atrasadas' },
  { value: 'complete', label: 'Completas' },
  { value: 'closed', label: 'Encerradas' },
] as const;
export type PanelStatusFilter = (typeof STATUS_CHIPS)[number]['value'];

export const statusFilterOf = (value: string | null): PanelStatusFilter =>
  STATUS_CHIPS.some((chip) => chip.value === value) ? (value as PanelStatusFilter) : 'all';

export const toLines = (rows: PanelRow[], cnpjByCompany: Map<string, string>): PanelLine[] =>
  rows.map((row) => {
    const total = Object.values(row.counts).reduce((sum, value) => sum + value, 0);
    const awaiting = row.missing.filter((item) => item.status !== 'submitted');
    return {
      ...row,
      awaiting,
      toReview: row.missing.filter((item) => item.status === 'submitted'),
      cnpj: cnpjByCompany.get(row.companyId) ?? null,
      total,
      percent: total ? Math.round((row.counts.accepted / total) * 100) : 0,
      overdue: awaiting.filter((item) => isOverdue(item.dueDate)).length,
    };
  });

const matchesStatus: Record<PanelStatusFilter, (line: PanelLine) => boolean> = {
  all: () => true,
  pending: (line) => line.requestStatus === 'open' && line.missing.length > 0,
  overdue: (line) => line.overdue > 0,
  complete: (line) => line.missing.length === 0,
  closed: (line) => line.requestStatus === 'closed',
};

export const statusCounts = (lines: PanelLine[]) =>
  Object.fromEntries(
    STATUS_CHIPS.map((chip) => [chip.value, lines.filter(matchesStatus[chip.value]).length]),
  ) as Record<PanelStatusFilter, number>;

export const accountantOptions = (lines: PanelLine[]) => {
  const names = new Map<string, string>();
  let hasUnassigned = false;
  for (const line of lines) {
    if (line.responsibleAccountantId && line.responsibleAccountantName) {
      names.set(line.responsibleAccountantId, line.responsibleAccountantName);
    } else {
      hasUnassigned = true;
    }
  }
  if (names.size === 0) return [];
  return [
    { value: 'all', label: 'Todos os contadores' },
    ...[...names].map(([value, label]) => ({ value, label })),
    ...(hasUnassigned ? [{ value: 'unassigned', label: 'Sem responsável' }] : []),
  ];
};

export const visibleLines = (
  lines: PanelLine[],
  { search, status, accountant }: { search: string; status: PanelStatusFilter; accountant: string },
) => {
  const term = foldAccents(search.trim());
  return lines.filter((line) => {
    if (term && !foldAccents(line.companyName).includes(term)) return false;
    if (!matchesStatus[status](line)) return false;
    if (accountant === 'all') return true;
    if (accountant === 'unassigned') return line.responsibleAccountantId === null;
    return line.responsibleAccountantId === accountant;
  });
};

export const deliveryProgress = (lines: PanelLine[]) => {
  const total = lines.reduce((sum, line) => sum + line.total, 0);
  const accepted = lines.reduce((sum, line) => sum + line.counts.accepted, 0);
  return { total, accepted, percent: total ? Math.round((accepted / total) * 100) : 0 };
};

export const closeImpact = (lines: PanelLine[]) => {
  const open = lines.filter((line) => line.requestStatus !== 'closed');
  return {
    unaccepted: open.reduce((sum, line) => sum + line.missing.length, 0),
    companies: open.filter((line) => line.missing.length > 0).length,
    toReview: open.reduce((sum, line) => sum + line.toReview.length, 0),
    extrasToReview: open.reduce((sum, line) => sum + line.pendingExtraCount, 0),
  };
};

const CHANNEL_LABEL: Record<string, string> = {
  email: 'e-mail',
  whatsapp: 'WhatsApp',
  push: 'push',
};

export const failedChannels = (line: PanelLine) => [
  ...new Set(
    line.channelFailures.map((failure) => CHANNEL_LABEL[failure.channel] ?? failure.channel),
  ),
];
