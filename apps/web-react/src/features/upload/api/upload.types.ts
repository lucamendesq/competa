import type { PresignedFile } from '@/shared/upload';

export type UploadedFile = {
  reviewStatus: 'pending' | 'accepted' | 'rejected';
  rejectionReason: string | null;
};

export type ChecklistItem = {
  id: string;
  name: string;
  description: string | null;
  acceptedFormats: string[];
  dueDate: string | null;
  status: 'pending' | 'submitted' | 'accepted' | 'rejected';
  documents: UploadedFile[];
};

export type UploadChecklist = {
  company: string;
  accountingFirm: string;
  accountingFirmLogoUrl: string | null;
  hasAccess: boolean;
  referenceMonth: string;
  dueDate: string | null;
  status: 'open' | 'complete' | 'closed';
  items: ChecklistItem[];
  extraDocuments: UploadedFile[];
};

export type Presign = { files: PresignedFile[] };

export type Confirmation = {
  confirmed: number;
  submittedItemIds: string[];
  refused: { documentId: string; fileName: string; reason: string }[];
};

export type AccessActivation = { email: string; name: string; nextStep: 'check_email' };
