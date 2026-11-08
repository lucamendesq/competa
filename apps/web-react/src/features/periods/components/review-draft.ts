import type { ReviewBatchBody } from '@competa/contracts';

export type ExtraDecision = { decision: 'accepted' | 'rejected'; rejectionReason: string };

export type ReviewDraft = {
  acceptedItemIds: ReadonlySet<string>;
  rejections: ReadonlyMap<string, string>;
  extras: ReadonlyMap<string, ExtraDecision>;
};

export type ReviewAction =
  | { type: 'toggleAccept'; itemId: string; documentIds: readonly string[] }
  | { type: 'toggleRejection'; itemId: string; documentId: string }
  | { type: 'setRejection'; documentId: string; reason: string }
  | { type: 'clearRejection'; documentId: string }
  | { type: 'toggleExtra'; documentId: string; decision: ExtraDecision['decision'] }
  | { type: 'setExtraReason'; documentId: string; reason: string }
  | { type: 'reset' };

export const emptyDraft: ReviewDraft = {
  acceptedItemIds: new Set(),
  rejections: new Map(),
  extras: new Map(),
};

export const REASON_MAX_LENGTH = 500;

export function reviewDraftReducer(draft: ReviewDraft, action: ReviewAction): ReviewDraft {
  switch (action.type) {
    case 'toggleAccept': {
      const accepted = new Set(draft.acceptedItemIds);
      if (accepted.has(action.itemId)) {
        accepted.delete(action.itemId);
        return { ...draft, acceptedItemIds: accepted };
      }
      accepted.add(action.itemId);
      const rejections = new Map(draft.rejections);
      for (const documentId of action.documentIds) rejections.delete(documentId);
      return { ...draft, acceptedItemIds: accepted, rejections };
    }
    case 'toggleRejection': {
      const rejections = new Map(draft.rejections);
      if (rejections.has(action.documentId)) {
        rejections.delete(action.documentId);
        return { ...draft, rejections };
      }
      rejections.set(action.documentId, '');
      const accepted = new Set(draft.acceptedItemIds);
      accepted.delete(action.itemId);
      return { ...draft, rejections, acceptedItemIds: accepted };
    }
    case 'setRejection': {
      const rejections = new Map(draft.rejections);
      rejections.set(action.documentId, action.reason);
      return { ...draft, rejections };
    }
    case 'clearRejection': {
      const rejections = new Map(draft.rejections);
      rejections.delete(action.documentId);
      return { ...draft, rejections };
    }
    case 'toggleExtra': {
      const extras = new Map(draft.extras);
      const current = extras.get(action.documentId);
      if (current?.decision === action.decision) extras.delete(action.documentId);
      else
        extras.set(action.documentId, {
          decision: action.decision,
          rejectionReason: current?.rejectionReason ?? '',
        });
      return { ...draft, extras };
    }
    case 'setExtraReason': {
      const current = draft.extras.get(action.documentId);
      if (!current) return draft;
      const extras = new Map(draft.extras);
      extras.set(action.documentId, { ...current, rejectionReason: action.reason });
      return { ...draft, extras };
    }
    case 'reset':
      return emptyDraft;
  }
}

export const decisionCount = (draft: ReviewDraft) =>
  draft.acceptedItemIds.size + draft.rejections.size + draft.extras.size;

export const missingReason = (draft: ReviewDraft) =>
  [...draft.rejections.values()].some((reason) => reason.trim().length < 3) ||
  [...draft.extras.values()].some(
    (extra) => extra.decision === 'rejected' && extra.rejectionReason.trim().length < 3,
  );

export const toReviewBatch = (draft: ReviewDraft): ReviewBatchBody => ({
  acceptItemIds: [...draft.acceptedItemIds],
  rejectDocuments: [...draft.rejections].map(([documentId, rejectionReason]) => ({
    documentId,
    rejectionReason: rejectionReason.trim(),
  })),
  reviewExtras: [...draft.extras].map(([documentId, extra]) => ({
    documentId,
    decision: extra.decision,
    ...(extra.decision === 'rejected' ? { rejectionReason: extra.rejectionReason.trim() } : {}),
  })),
});
