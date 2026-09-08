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
  // Extra não tem Item para reabrir nem link para reenviar: vai pela rota própria.
  if (!input.requestItemId) {
    return 'Documento Extra é revisado em /documents/:id/review-extra, não por esta rota.';
  }
  if (input.reviewStatus === 'rejected') return 'Este documento já foi rejeitado.';
  if (input.reviewStatus === 'accepted') {
    return 'Este documento já foi aceito e não volta para rejeitado.';
  }

  return null;
};

export const reviewExtraRefusal = (input: {
  requestStatus: RequestStatus;
  reviewStatus: ReviewStatus;
}) => {
  if (input.requestStatus === 'closed') {
    return 'Esta solicitação foi encerrada: os documentos não podem mais ser revisados.';
  }
  if (input.reviewStatus === 'accepted') return 'Este documento já está aceito.';
  if (input.reviewStatus === 'rejected') return 'Este documento já foi rejeitado.';

  return null;
};

export const undoAcceptRefusal = (input: {
  requestStatus: RequestStatus;
  itemStatus: ItemStatus;
}) => {
  if (input.requestStatus === 'closed') {
    return 'Esta solicitação foi encerrada: o aceite não pode mais ser desfeito.';
  }
  if (input.itemStatus !== 'accepted') return 'Este item não está aceito.';

  return null;
};

export const requestStatusAfterReview = (
  current: RequestStatus,
  itemStatuses: ItemStatus[],
): RequestStatus => {
  if (current === 'closed') return 'closed';

  const allAccepted =
    itemStatuses.length > 0 && itemStatuses.every((status) => status === 'accepted');

  return allAccepted ? 'complete' : 'open';
};

export const effectiveDueDate = (item: { dueDate: string | null; periodDueDate: string | null }) =>
  item.dueDate ?? item.periodDueDate;

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
  /** Item com Documento rejeitado. O Item recusado volta para `pending` (é o que reabre o
   *  envio), então sem esta marca o painel conta "pendente" e some com a recusa — e a
   *  coluna `rejected` nunca sai de zero. */
  hasRejection?: boolean;
};

/** O que o painel mostra: `rejected` quando a recusa ainda não foi refeita, mesmo que a
 *  reabertura já tenha devolvido o Item para `pending`. */
export const panelItemStatus = (row: {
  itemStatus: ItemStatus | null;
  hasRejection?: boolean;
}): ItemStatus => (row.hasRejection && row.itemStatus === 'pending' ? 'rejected' : row.itemStatus!);

export const summarizePending = (rows: PanelRow[]) => {
  const byCompany = new Map<string, ReturnType<typeof emptyCompany>>();

  for (const row of rows) {
    const company = byCompany.get(row.companyId) ?? emptyCompany(row);
    byCompany.set(row.companyId, company);

    if (!row.itemId || !row.itemStatus || !row.itemName) continue;

    const status = panelItemStatus(row);

    company.counts[status] += 1;

    if (status !== 'accepted') {
      company.missing.push({
        id: row.itemId,
        name: row.itemName,
        status,
        // `submitted` com recusa no histórico = o Responsável já mandou o corrigido e o
        // Item espera nova conferência. "Enviado" sozinho não diz isso ao Contador.
        resent: row.itemStatus === 'submitted' && Boolean(row.hasRejection),
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
  missing: [] as {
    id: string;
    name: string;
    status: ItemStatus;
    resent: boolean;
    dueDate: string | null;
  }[],
});
