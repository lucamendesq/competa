import type {
  ImportPreviewLine,
  ImportPreviewResult,
  ImportResult,
  PlanUsage,
} from '@/features/companies/api/company.types';
import type { ReadSpreadsheet } from '@/features/companies/utils/spreadsheet';

export type InvitesSent = { invited: number; skipped: { reason: string; count: number }[] };

export type ImportState =
  | { status: 'idle'; file: ReadSpreadsheet | null; error: string | null }
  | { status: 'reading'; file: ReadSpreadsheet | null; error: null }
  | {
      status: 'previewing';
      preview: ImportPreviewResult;
      activateChoice: boolean | null;
      invites: InvitesSent | null;
    }
  | {
      status: 'done';
      preview: ImportPreviewResult;
      confirmed: ImportResult;
      activateChoice: boolean | null;
      invites: InvitesSent | null;
    };

export type ImportAction =
  | { type: 'reading' }
  | { type: 'fileRead'; file: ReadSpreadsheet }
  | { type: 'failed'; error: string }
  | { type: 'previewed'; preview: ImportPreviewResult }
  | { type: 'confirmed'; confirmed: ImportResult }
  | { type: 'invitesSent'; invites: InvitesSent }
  | { type: 'setActivate'; activate: boolean }
  | { type: 'discard' };

export const initialImportState: ImportState = { status: 'idle', file: null, error: null };

export function importReducer(state: ImportState, action: ImportAction): ImportState {
  switch (action.type) {
    case 'reading':
      return { status: 'reading', file: 'file' in state ? state.file : null, error: null };
    case 'fileRead':
      return { status: 'idle', file: action.file, error: null };
    case 'failed':
      return { status: 'idle', file: 'file' in state ? state.file : null, error: action.error };
    case 'previewed':
      return { status: 'previewing', preview: action.preview, activateChoice: null, invites: null };
    case 'confirmed':
      return state.status === 'previewing'
        ? { ...state, status: 'done', confirmed: action.confirmed }
        : state;
    case 'invitesSent':
      return state.status === 'previewing' || state.status === 'done'
        ? { ...state, invites: action.invites }
        : state;
    case 'setActivate':
      return state.status === 'previewing' ? { ...state, activateChoice: action.activate } : state;
    case 'discard':
      return initialImportState;
  }
}

export type PendingLine = Extract<ImportPreviewLine, { status: 'pending' }>;

export const pendingLinesOf = (preview: ImportPreviewResult) =>
  preview.lines.filter((line): line is PendingLine => line.status === 'pending');

export const splitOf = (
  pending: PendingLine[],
  usage: PlanUsage | undefined,
  activateChoice: boolean | null,
) => {
  const ready = pending.length;
  const fresh = pending.filter((row) => row.existingName === undefined).length;
  const slots = usage ? Math.max(0, usage.softCap - usage.companiesActive) : fresh;
  const activate = activateChoice ?? (usage ? fresh <= slots : true);
  const active = activate ? Math.min(fresh, slots) : 0;
  return { ready, fresh, updating: ready - fresh, active, inactive: fresh - active, activate };
};

export const skippedReasons = (results: { status: string; reason?: string }[]) => {
  const skipped = new Map<string, number>();
  for (const row of results) {
    if (row.status === 'invited' || !row.reason) continue;
    skipped.set(row.reason, (skipped.get(row.reason) ?? 0) + 1);
  }
  return [...skipped].map(([reason, count]) => ({ reason, count }));
};
