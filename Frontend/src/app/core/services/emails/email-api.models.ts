export type EmailEntityType = 'lead' | 'deal' | 'contact';

export type EmailDeliveryStatus = 'sent' | 'failed' | 'draft' | 'pending';

export interface SendEmailDto {
  entityType: EmailEntityType | string;
  entityId: number;
  toEmail: string;
  subject: string;
  body: string;
  isHtml: boolean;
  sentBy?: number | null;
}

export interface EntityEmailItem {
  id: string;
  entityType: EmailEntityType;
  entityId: number;
  senderDisplay: string;
  senderInitial: string;
  subjectLine: string;
  toAddress: string;
  status: 'Sent' | 'Failed' | 'Draft';
  whenLabel: string;
  body: string;
  isHtml: boolean;
  failureMessage?: string;
  createdAt: string;
}

export interface EmailListQuery {
  entityType: EmailEntityType;
  entityId: number;
  userId?: number;
}
