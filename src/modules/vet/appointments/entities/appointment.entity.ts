import { BaseDocument } from '../../../../shared/firestore/base-document';

export const APPOINTMENT_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

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
}

export interface AppointmentListItem extends Appointment {
  customerName: string;
  patientName: string;
}
