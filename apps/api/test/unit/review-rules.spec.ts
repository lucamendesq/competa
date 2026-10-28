import { describe, expect, it } from 'vitest';
import {
  acceptItemRefusal,
  effectiveDueDate,
  missedDeadline,
  panelItemStatus,
  rejectDocumentRefusal,
  requestStatusAfterReview,
  reviewExtraRefusal,
  summarizePending,
  undoAcceptRefusal,
  type ItemStatus,
  type PanelRow,
  type RequestStatus,
} from '../../src/modules/requests/review-rules.js';

/* Os casos abaixo vêm da tabela "Transições de estado" do `docs/database-schema.md`, não do
 * que a implementação faz hoje. Onde a doc e o código discordarem, o teste segue a doc e a
 * divergência vira conversa — é essa a diferença entre teste de especificação e espelho.
 *
 * Normativo (database-schema.md):
 *   request_item.status  pending → submitted (upload) → accepted | rejected (revisão);
 *                        rejected → pending (reabertura)
 *   request.status       open → complete (todos os itens accepted, automático);
 *                        open|complete → closed (ato do Contador)
 *   document.review_status  pending → accepted | rejected
 *   Encerrada: só aceita Documento Extra (request_item_id IS NULL). */

const ITEM_STATUSES: ItemStatus[] = ['pending', 'submitted', 'accepted', 'rejected'];
const OPEN_STATUSES: RequestStatus[] = ['open', 'complete'];

describe('acceptItemRefusal — aceitar Item', () => {
  it('só aceita Item que está `submitted`', () => {
    for (const requestStatus of OPEN_STATUSES) {
      expect(acceptItemRefusal({ requestStatus, itemStatus: 'submitted' })).toBeNull();
    }
  });

  it('recusa todo Item que não chegou a `submitted`, dizendo por quê', () => {
    for (const itemStatus of ITEM_STATUSES.filter((status) => status !== 'submitted')) {
      const refusal = acceptItemRefusal({ requestStatus: 'open', itemStatus });
      expect(refusal, `itemStatus=${itemStatus}`).not.toBeNull();
    }
  });

  it('Item já aceito recebe recusa própria, não a genérica', () => {
    expect(acceptItemRefusal({ requestStatus: 'open', itemStatus: 'accepted' })).toBe(
      'Este item já está aceito.',
    );
  });

  /* `closed` é ato do Contador e vale sobre QUALQUER estado do Item — inclusive o que
   * passaria na régua normal. */
  it('encerrada recusa mesmo o Item que seria aceitável', () => {
    for (const itemStatus of ITEM_STATUSES) {
      expect(acceptItemRefusal({ requestStatus: 'closed', itemStatus })).toBe(
        'Esta solicitação foi encerrada: os itens não podem mais ser revisados.',
      );
    }
  });
});

describe('rejectDocumentRefusal — rejeitar Documento de Item', () => {
  it('rejeita Documento `pending` de um Item', () => {
    expect(
      rejectDocumentRefusal({
        requestStatus: 'open',
        reviewStatus: 'pending',
        requestItemId: 'item-1',
      }),
    ).toBeNull();
  });

  /* Extra não tem Item para reabrir nem link para reenviar: a rota é outra. */
  it('Documento Extra é recusado por esta rota, com o caminho certo na mensagem', () => {
    const refusal = rejectDocumentRefusal({
      requestStatus: 'open',
      reviewStatus: 'pending',
      requestItemId: null,
    });
    expect(refusal).toContain('/documents/:id/review-extra');
  });

  it('aceite não volta para rejeitado', () => {
    expect(
      rejectDocumentRefusal({
        requestStatus: 'open',
        reviewStatus: 'accepted',
        requestItemId: 'item-1',
      }),
    ).toBe('Este documento já foi aceito e não volta para rejeitado.');
  });

  it('encerrada vence até a checagem de Extra', () => {
    expect(
      rejectDocumentRefusal({
        requestStatus: 'closed',
        reviewStatus: 'pending',
        requestItemId: null,
      }),
    ).toBe('Esta solicitação foi encerrada: os documentos não podem mais ser revisados.');
  });
});

describe('reviewExtraRefusal — revisar Documento Extra', () => {
  it('revisa Extra `pending`', () => {
    expect(reviewExtraRefusal({ requestStatus: 'open', reviewStatus: 'pending' })).toBeNull();
  });

  it('não revisa duas vezes', () => {
    expect(reviewExtraRefusal({ requestStatus: 'open', reviewStatus: 'accepted' })).toBe(
      'Este documento já está aceito.',
    );
    expect(reviewExtraRefusal({ requestStatus: 'open', reviewStatus: 'rejected' })).toBe(
      'Este documento já foi rejeitado.',
    );
  });

  /* Assimetria DELIBERADA com `rejectDocumentRefusal`: `database-schema.md` diz que
   * Solicitação encerrada continua ACEITANDO Documento Extra. Se ele ainda chega depois do
   * encerramento, tem de poder ser revisado — barrar aqui o deixaria em limbo. */
  it('encerrada NÃO barra a revisão de Extra', () => {
    expect(reviewExtraRefusal({ requestStatus: 'closed', reviewStatus: 'pending' })).toBeNull();
  });
});

describe('undoAcceptRefusal — desfazer aceite', () => {
  it('desfaz só o que está aceito', () => {
    expect(undoAcceptRefusal({ requestStatus: 'open', itemStatus: 'accepted' })).toBeNull();

    for (const itemStatus of ITEM_STATUSES.filter((status) => status !== 'accepted')) {
      expect(undoAcceptRefusal({ requestStatus: 'open', itemStatus })).toBe(
        'Este item não está aceito.',
      );
    }
  });

  it('encerrada não deixa desfazer', () => {
    expect(undoAcceptRefusal({ requestStatus: 'closed', itemStatus: 'accepted' })).toBe(
      'Esta solicitação foi encerrada: o aceite não pode mais ser desfeito.',
    );
  });
});

describe('requestStatusAfterReview — `complete` é derivado', () => {
  const required = (status: ItemStatus) => ({ status, required: true });
  const optional = (status: ItemStatus) => ({ status, required: false });

  it('todos os obrigatórios aceitos → complete', () => {
    expect(requestStatusAfterReview('open', [required('accepted'), required('accepted')])).toBe(
      'complete',
    );
  });

  it('um obrigatório fora de aceito segura em open', () => {
    for (const status of ITEM_STATUSES.filter((value) => value !== 'accepted')) {
      expect(requestStatusAfterReview('open', [required('accepted'), required(status)])).toBe(
        'open',
      );
    }
  });

  /* O `required` existia no template e era descartado na abertura, e um Item opcional
   * segurava o fechamento igual a um obrigatório. */
  it('opcional pendente não segura o complete', () => {
    expect(requestStatusAfterReview('open', [required('accepted'), optional('pending')])).toBe(
      'complete',
    );
  });

  it('complete é reversível: desfazer um aceite volta para open', () => {
    expect(requestStatusAfterReview('complete', [required('submitted')])).toBe('open');
  });

  /* `closed` é ato do Contador: nenhuma revisão o desfaz. */
  it('closed é terminal', () => {
    expect(requestStatusAfterReview('closed', [required('accepted')])).toBe('closed');
    expect(requestStatusAfterReview('closed', [required('pending')])).toBe('closed');
  });

  /* Checklist SÓ de opcionais nunca completa: `required.length > 0` é exigido. É decisão
   * registrada (bug congelado #18), não acidente — se mudar, muda aqui primeiro. */
  it('checklist só de opcionais não completa', () => {
    expect(requestStatusAfterReview('open', [optional('accepted'), optional('accepted')])).toBe(
      'open',
    );
  });

  it('solicitação sem item nenhum não completa', () => {
    expect(requestStatusAfterReview('open', [])).toBe('open');
  });
});

describe('prazo efetivo e prazo estourado', () => {
  it('o prazo do Item vence o da competência; sem o do Item, herda', () => {
    expect(effectiveDueDate({ dueDate: '2026-10-05', periodDueDate: '2026-10-20' })).toBe(
      '2026-10-05',
    );
    expect(effectiveDueDate({ dueDate: null, periodDueDate: '2026-10-20' })).toBe('2026-10-20');
    expect(effectiveDueDate({ dueDate: null, periodDueDate: null })).toBeNull();
  });

  it('só `pending` e `rejected` estouram prazo — o que já foi entregue, não', () => {
    const vencido = { dueDate: '2026-10-05', periodDueDate: null };

    expect(missedDeadline({ status: 'pending', ...vencido }, '2026-10-06')).toBe(true);
    expect(missedDeadline({ status: 'rejected', ...vencido }, '2026-10-06')).toBe(true);
    expect(missedDeadline({ status: 'submitted', ...vencido }, '2026-10-06')).toBe(false);
    expect(missedDeadline({ status: 'accepted', ...vencido }, '2026-10-06')).toBe(false);
  });

  it('o dia do vencimento ainda não está estourado', () => {
    const item = { status: 'pending' as const, dueDate: '2026-10-05', periodDueDate: null };

    expect(missedDeadline(item, '2026-10-05')).toBe(false);
    expect(missedDeadline(item, '2026-10-06')).toBe(true);
  });

  it('sem prazo nenhum não há como estourar', () => {
    expect(
      missedDeadline({ status: 'pending', dueDate: null, periodDueDate: null }, '2030-01-01'),
    ).toBe(false);
  });
});

describe('painel de pendências', () => {
  /* A reabertura devolve o Item para `pending`, então sem a marca de recusa o painel
   * contaria "pendente" e a coluna `rejected` nunca sairia de zero. */
  it('Item reaberto aparece como `rejected`, não como `pending`', () => {
    expect(panelItemStatus({ itemStatus: 'pending', hasRejection: true })).toBe('rejected');
    expect(panelItemStatus({ itemStatus: 'pending', hasRejection: false })).toBe('pending');
  });

  it('a marca de recusa não mexe em Item que já avançou', () => {
    expect(panelItemStatus({ itemStatus: 'submitted', hasRejection: true })).toBe('submitted');
    expect(panelItemStatus({ itemStatus: 'accepted', hasRejection: true })).toBe('accepted');
  });

  const row = (over: Partial<PanelRow>): PanelRow => ({
    companyId: 'c1',
    companyName: 'Empresa Um',
    requestId: 'r1',
    requestStatus: 'open',
    itemId: 'i1',
    itemName: 'Notas',
    itemStatus: 'pending',
    itemDueDate: '2026-10-05',
    periodDueDate: '2026-10-20',
    ...over,
  });

  it('agrupa por Empresa e conta por status', () => {
    const [company] = summarizePending([
      row({ itemId: 'i1', itemStatus: 'pending' }),
      row({ itemId: 'i2', itemStatus: 'accepted' }),
      row({ itemId: 'i3', itemStatus: 'submitted' }),
    ]);

    expect(company.counts).toEqual({ pending: 1, submitted: 1, accepted: 1, rejected: 0 });
  });

  it('o que falta exclui o aceito e carrega o prazo efetivo', () => {
    const [company] = summarizePending([
      row({ itemId: 'i1', itemStatus: 'pending' }),
      row({ itemId: 'i2', itemStatus: 'accepted' }),
    ]);

    expect(company.missing).toHaveLength(1);
    expect(company.missing[0]).toMatchObject({ id: 'i1', dueDate: '2026-10-05' });
  });

  /* "Enviado" sozinho não diz ao Contador que é a segunda tentativa. */
  it('`resent` marca o reenvio depois de uma recusa', () => {
    const [company] = summarizePending([row({ itemStatus: 'submitted', hasRejection: true })]);

    expect(company.missing[0].resent).toBe(true);
  });

  it('Empresa sem Item aparece mesmo assim, zerada', () => {
    const [company] = summarizePending([row({ itemId: null, itemName: null, itemStatus: null })]);

    expect(company.companyId).toBe('c1');
    expect(company.counts).toEqual({ pending: 0, submitted: 0, accepted: 0, rejected: 0 });
    expect(company.missing).toEqual([]);
  });

  it('Empresas diferentes não se misturam', () => {
    const summary = summarizePending([
      row({ companyId: 'c1' }),
      row({ companyId: 'c2', companyName: 'Empresa Dois', requestId: 'r2' }),
    ]);

    expect(summary.map((company) => company.companyId)).toEqual(['c1', 'c2']);
  });
});
