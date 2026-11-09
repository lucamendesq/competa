import { api } from '@/shared/lib/api-client';
import type {
  ImportPreviewResult,
  ImportResult,
  PendingImportRow,
} from '@/features/companies/api/company.types';

export const importCsv = (csv: string) =>
  api.post<ImportPreviewResult>('/companies/import', { csv });

export const confirmImport = (pending: PendingImportRow[], activate: boolean) =>
  api.post<ImportResult>('/companies/import/confirm', { pending, activate });
