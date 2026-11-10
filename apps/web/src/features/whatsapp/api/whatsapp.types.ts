export type WhatsAppStatus =
  | 'not_connected'
  | 'pending_phone'
  | 'pending_payment'
  | 'pending_template'
  | 'active'
  | 'suspended'
  | 'error';

export type WhatsAppConnection = {
  status: WhatsAppStatus;
  displayPhoneNumber?: string;
  wabaId?: string;
};
