export type ItemStatus = 'pending' | 'submitted' | 'accepted' | 'rejected';
export type RequestStatus = 'open' | 'complete' | 'closed';
export type ReviewStatus = 'pending' | 'accepted' | 'rejected';

/** Transições normativas (database-schema.md): `pending → submitted → accepted | rejected`
 *  no Item, com `rejected → pending` na reabertura; `pending → accepted | rejected` no
 *  Documento. Cada função devolve o motivo da recusa em PT-BR ou `null` quando a
 *  transição é válida — nunca update silencioso. */
export const acceptItemRefusal = (input: {
  requestStatus: RequestStatus;
  itemStatus: ItemStatus;
}) => {
  if (input.requestStatus === 'closed') {
    return 'Esta solicitação foi encerrada: os itens não podem mais ser revisados.';
  }
  if (input.itemStatus === 'accepted') return 'Este item já está aceito.';
  if (input.itemStatus !== 'submitted') {
    return 'Este item ainda não tem documentos enviados para revisar.';
  }

  return null;
};

export const rejectDocumentRefusal = (input: {
  requestStatus: RequestStatus;
  reviewStatus: ReviewStatus;
  requestItemId: string | null;
}) => {
  if (input.requestStatus === 'closed') {
    return 'Esta solicitação foi encerrada: os documentos não podem mais ser revisados.';
  }
  if (!input.requestItemId) {
    return 'Documento Extra não passa por revisão: ele não pertence a nenhum item do checklist.';
  }
  if (input.reviewStatus === 'rejected') return 'Este documento já foi rejeitado.';
  if (input.reviewStatus === 'accepted') {
    return 'Este documento já foi aceito e não volta para rejeitado.';
  }

  return null;
};

/** `open → complete` é automático (todos os itens aceitos) e reversível: rejeitar um
 *  Documento reabre o Item e a Solicitação volta para `open`. Encerrada é palavra final. */
export const requestStatusAfterReview = (
  current: RequestStatus,
  itemStatuses: ItemStatus[],
): RequestStatus => {
  if (current === 'closed') return 'closed';

  const allAccepted =
    itemStatuses.length > 0 && itemStatuses.every((status) => status === 'accepted');

  return allAccepted ? 'complete' : 'open';
};

/** Prazo do Item, senão o prazo geral da Competência (fallback), senão sem prazo. */
export const effectiveDueDate = (item: {
  dueDate: string | null;
  periodDueDate: string | null;
}) => item.dueDate ?? item.periodDueDate;

/** Elegível a `DeadlineMissed`: o Responsável ainda não entregou (`pending`) ou o Item foi
 *  reaberto (`rejected`) e o prazo efetivo já passou. Datas em `YYYY-MM-DD` comparam
 *  lexicograficamente. */
export const missedDeadline = (
  item: { status: ItemStatus; dueDate: string | null; periodDueDate: string | null },
  today: string,
) => {
  if (item.status !== 'pending' && item.status !== 'rejected') return false;

  const dueDate = effectiveDueDate(item);

  return dueDate !== null && dueDate < today;
};

export type PanelRow = {
  companyId: string;
  companyName: string;
  requestId: string;
  requestStatus: RequestStatus;
  itemId: string | null;
  itemName: string | null;
  itemStatus: ItemStatus | null;
  itemDueDate: string | null;
  periodDueDate: string | null;
};

/** Painel de Pendências ("quem faltou"): uma linha por Empresa com a contagem por estado
 *  e a lista do que ainda falta (todo Item não aceito), cada um com o prazo efetivo. */
export const summarizePending = (rows: PanelRow[]) => {
  const byCompany = new Map<string, ReturnType<typeof emptyCompany>>();

  for (const row of rows) {
    const company = byCompany.get(row.companyId) ?? emptyCompany(row);
    byCompany.set(row.companyId, company);

    if (!row.itemId || !row.itemStatus || !row.itemName) continue;

    company.counts[row.itemStatus] += 1;

    if (row.itemStatus !== 'accepted') {
      company.missing.push({
        id: row.itemId,
        name: row.itemName,
        status: row.itemStatus,
        dueDate: effectiveDueDate({ dueDate: row.itemDueDate, periodDueDate: row.periodDueDate }),
      });
    }
  }

  return [...byCompany.values()];
};

const emptyCompany = (row: PanelRow) => ({
  companyId: row.companyId,
  companyName: row.companyName,
  requestId: row.requestId,
  requestStatus: row.requestStatus,
  counts: { pending: 0, submitted: 0, accepted: 0, rejected: 0 },
  missing: [] as { id: string; name: string; status: ItemStatus; dueDate: string | null }[],
});
