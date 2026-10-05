import { BaseDocument } from '../../../../shared/firestore/base-document';

export const COMMUNICATION_CHANNELS = ['whatsapp', 'sms'] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export const COMMUNICATION_CATEGORIES = [
  'vaccine_reminder',
  'appointment_reminder',
  'control_reminder',
  'custom',
] as const;
export type CommunicationCategory = (typeof COMMUNICATION_CATEGORIES)[number];

export interface CommunicationLog extends BaseDocument {
  channel: CommunicationChannel;
  category: CommunicationCategory;
  recipientPhone: string;
  recipientName: string;
  patientId?: string | null;
  patientName?: string | null;
  messageContent: string;
  status: 'sent' | 'pending' | 'failed';
  sentAt: string;
}
