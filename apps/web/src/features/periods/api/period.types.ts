import type {
  ChannelFailureResponse,
  MissingItemResponse,
  PanelRowResponse,
  PeriodDetailResponse,
  PeriodSummaryResponse,
  RequestDetailResponse,
} from '@competa/contracts';

export type Period = PeriodSummaryResponse;
export type PeriodDetail = PeriodDetailResponse & { deliveredCount: number; requestCount: number };
export type MissingItem = MissingItemResponse;
export type ChannelFailure = ChannelFailureResponse;
export type PanelRow = PanelRowResponse;

export type CreatedRequest = {
  id: string;
  companyId: string;
  companyName: string;
  itemCount: number;
  uploadUrl: string;
};

export type FanOutWarning = {
  companyId: string;
  companyName: string;
  reason: string;
  blockedBy: 'contact' | 'template';
};

export type PeriodOpening = {
  id: string;
  referenceMonth: string;
  status: string;
  dueDate: string | null;
  warnings: FanOutWarning[];
  requests: CreatedRequest[];
};

export type PeriodPreview = {
  existingPeriodId: string | null;
  requests: { companyId: string; companyName: string; contactName: string; itemCount: number }[];
  skipped: FanOutWarning[];
  notes: FanOutWarning[];
};

export type PeriodClosing = {
  id: string;
  referenceMonth: string;
  status: string;
  closedRequestCount: number;
  pendingItemCount: number;
  warning: string | null;
};

export type ReminderRun = { scanned: number; sent: number; busy: boolean };

export type RequestDetail = RequestDetailResponse;
export type RequestItem = RequestDetailResponse['items'][number];
export type RequestDocument = RequestItem['documents'][number];

export type ReviewResult = {
  requestId: string;
  requestStatus: 'open' | 'complete' | 'closed';
  completed: boolean;
  acceptedItems: number;
  rejectedDocuments: number;
  linkRotated: boolean;
  emailSent: boolean;
};

export type RequestClosing = {
  id: string;
  status: string;
  pendingItemCount: number;
  warning: string | null;
};

export type UploadLink = { uploadUrl: string; contactEmail: string };
