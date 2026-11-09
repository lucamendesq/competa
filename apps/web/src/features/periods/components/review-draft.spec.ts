import { describe, expect, it } from 'vitest';
import {
  decisionCount,
  emptyDraft,
  missingReason,
  reviewDraftReducer,
  toReviewBatch,
} from '@/features/periods/components/review-draft';

describe('reviewDraftReducer', () => {
  it('aceitar um item que tinha recusa limpa a recusa', () => {
    const rejected = reviewDraftReducer(emptyDraft, {
      type: 'toggleRejection',
      itemId: 'i1',
      documentId: 'd1',
    });
    const accepted = reviewDraftReducer(rejected, {
      type: 'toggleAccept',
      itemId: 'i1',
      documentIds: ['d1'],
    });

    expect(accepted.rejections.size).toBe(0);
    expect(accepted.acceptedItemIds.has('i1')).toBe(true);
  });

  it('recusar um documento desmarca o aceite do item', () => {
    const accepted = reviewDraftReducer(emptyDraft, {
      type: 'toggleAccept',
      itemId: 'i1',
      documentIds: ['d1'],
    });
    const rejected = reviewDraftReducer(accepted, {
      type: 'toggleRejection',
      itemId: 'i1',
      documentId: 'd1',
    });

    expect(rejected.acceptedItemIds.has('i1')).toBe(false);
    expect(rejected.rejections.get('d1')).toBe('');
  });

  it('extras alternam a decisão e guardam o motivo', () => {
    let draft = reviewDraftReducer(emptyDraft, {
      type: 'toggleExtra',
      documentId: 'x1',
      decision: 'rejected',
    });
    draft = reviewDraftReducer(draft, {
      type: 'setExtraReason',
      documentId: 'x1',
      reason: 'ilegível',
    });
    draft = reviewDraftReducer(draft, {
      type: 'toggleExtra',
      documentId: 'x1',
      decision: 'accepted',
    });

    expect(draft.extras.get('x1')).toEqual({ decision: 'accepted', rejectionReason: 'ilegível' });
    expect(
      reviewDraftReducer(draft, { type: 'toggleExtra', documentId: 'x1', decision: 'accepted' })
        .extras.size,
    ).toBe(0);
  });

  it('reset zera tudo', () => {
    let draft = reviewDraftReducer(emptyDraft, {
      type: 'toggleAccept',
      itemId: 'i1',
      documentIds: [],
    });
    draft = reviewDraftReducer(draft, { type: 'toggleRejection', itemId: 'i2', documentId: 'd2' });
    draft = reviewDraftReducer(draft, {
      type: 'toggleExtra',
      documentId: 'x1',
      decision: 'accepted',
    });

    expect(decisionCount(draft)).toBe(3);
    expect(reviewDraftReducer(draft, { type: 'reset' })).toEqual(emptyDraft);
  });

  it('exige motivo com 3+ caracteres e monta o lote com os três grupos', () => {
    let draft = reviewDraftReducer(emptyDraft, {
      type: 'toggleRejection',
      itemId: 'i2',
      documentId: 'd2',
    });
    expect(missingReason(draft)).toBe(true);
    draft = reviewDraftReducer(draft, {
      type: 'setRejection',
      documentId: 'd2',
      reason: '  borrado  ',
    });
    draft = reviewDraftReducer(draft, { type: 'toggleAccept', itemId: 'i1', documentIds: [] });
    draft = reviewDraftReducer(draft, {
      type: 'toggleExtra',
      documentId: 'x1',
      decision: 'accepted',
    });

    expect(missingReason(draft)).toBe(false);
    expect(toReviewBatch(draft)).toEqual({
      acceptItemIds: ['i1'],
      rejectDocuments: [{ documentId: 'd2', rejectionReason: 'borrado' }],
      reviewExtras: [{ documentId: 'x1', decision: 'accepted' }],
    });
  });
});
