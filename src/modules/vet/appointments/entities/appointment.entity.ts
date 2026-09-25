import { BaseDocument } from '../../../../shared/firestore/base-document';

export const APPOINTMENT_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export interface AppointmentLine {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxId: string | null;
  vatIncluded: boolean;
}

export interface Appointment extends BaseDocument {
  beginAt: string;
  endAt: string;
  customerId: string;
  patientId: string;
  doctorId: string;
  type: string;
  note: string | null;
  status: AppointmentStatus;
  reservationSlotIds: string[];
  plannedLines: AppointmentLine[];
  saleId: string | null;
}

export interface AppointmentListItem extends Appointment {
  customerName: string;
  patientName: string;
  saleInvoiceNo: string | null;
  saleTotal: number | null;
}
