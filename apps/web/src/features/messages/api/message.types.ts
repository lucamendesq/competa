import type { MESSAGE_CHANNELS, MESSAGE_PURPOSES, MESSAGE_STATUS } from '@competa/contracts';

export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];
export type MessagePurpose = (typeof MESSAGE_PURPOSES)[number];
export type MessageStatus = (typeof MESSAGE_STATUS)[number];

export type Message = {
  id: string;
  requestId: string;
  periodId: string;
  companyName: string;
  channel: MessageChannel;
  purpose: MessagePurpose;
  recipient: string;
  status: MessageStatus;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
};

export type CompanyFilterOption = { id: string; name: string };
