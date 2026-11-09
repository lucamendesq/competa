export type ItemStatus = 'pending' | 'submitted' | 'accepted' | 'rejected';

export type MyPendingItem = {
  requestId: string;
  periodId: string;
  referenceMonth: string;
  companyId: string;
  companyName: string;
  item: {
    id: string;
    name: string;
    description: string | null;
    acceptedFormats: string[];
    status: ItemStatus;
    dueDate: string | null;
    rejections: { fileName: string; rejectionReason: string | null }[];
  };
};

export type MyPeriod = {
  requestId: string;
  requestStatus: 'open' | 'complete' | 'closed';
  periodId: string;
  referenceMonth: string;
  periodStatus: 'open' | 'closed';
  dueDate: string | null;
  companyId: string;
  companyName: string;
  itemCount: number;
  pendingCount: number;
  deliveredCount: number;
};

export type MyDocument = {
  id: string;
  requestItemId: string | null;
  fileName: string;
  sizeBytes: number | null;
  uploadedAt: string;
  reviewStatus: 'pending' | 'accepted' | 'rejected';
  rejectionReason: string | null;
  uploadedByName: string | null;
};

export type MyPeriodDetail = Omit<MyPeriod, 'itemCount' | 'pendingCount' | 'deliveredCount'> & {
  items: {
    id: string;
    name: string;
    status: ItemStatus;
    dueDate: string | null;
    documents: MyDocument[];
  }[];
  extraDocuments: MyDocument[];
};

export type MyPresignedFile = {
  fileName: string;
  accepted: boolean;
  reason?: string;
  documentId?: string;
  uploadUrl?: string;
};
