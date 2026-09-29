export type Rejection = { fileName: string; rejectionReason: string | null };

type ItemWithRejections = {
  status: string;
  /** telas que carregam os arquivos do Item (revisão, detalhe da competência, link) */
  documents?: readonly { fileName: string; reviewStatus: string; rejectionReason: string | null }[];
  /** o Painel de Pendências não carrega arquivos: a API manda só as recusas */
  rejections?: readonly Rejection[];
};

/** O Item recusado volta para `pending` no banco (invariante do domínio
 *  `rejected → pending`, é o que reabre o envio). Consequência: o status sozinho não
 *  distingue "nunca enviei" de "enviei e voltou" — quem distingue é a existência de
 *  arquivo rejeitado. Sem isso as duas telas mostravam "Pendente" e o Contador não via a
 *  própria recusa, nem o Responsável o motivo dela. */
export const itemRejections = (item: ItemWithRejections): readonly Rejection[] =>
  item.rejections ??
  item.documents
    ?.filter((file) => file.reviewStatus === 'rejected')
    .map((file) => ({ fileName: file.fileName, rejectionReason: file.rejectionReason })) ??
  [];

/** SÓ enquanto o Item está `pending`: o reenvio o devolve para `submitted` e a recusa
 *  antiga passa a ser histórico. Sem esta condição o banner "Precisa reenviar" continuava
 *  na tela depois do reenvio, cobrando um arquivo que já chegou. */
export const needsResend = (item: ItemWithRejections) =>
  item.status === 'pending' && itemRejections(item).length > 0;

/** Reenviado depois de uma recusa: `submitted` com recusa no histórico. Para o Contador,
 *  "Enviado" sozinho não diz que este é o arquivo corrigido esperando nova conferência. */
export const wasResent = (item: ItemWithRejections) =>
  item.status === 'submitted' && itemRejections(item).length > 0;

/** Status para exibir: `rejected` enquanto a recusa não foi refeita, `resent` quando o
 *  corrigido já chegou e espera nova conferência — os dois são pendência, não entrega. */
export const displayItemStatus = (item: ItemWithRejections) => {
  if (needsResend(item)) return 'rejected';
  if (wasResent(item)) return 'resent';

  return item.status;
};
