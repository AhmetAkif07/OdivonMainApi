import { BaseDocument } from '../../../../shared/firestore/base-document';

export interface VaccineSchedule extends BaseDocument {
  patientId: string;
  customerId: string;
  vaccineId: string;
  vaccineName: string;
  animalType: string | null;
  dueAt: string;
  doneAt: string | null;
  done: boolean;
  note: string | null;
}

export interface VaccineScheduleListItem extends VaccineSchedule {
  patientName: string;
  customerName: string;
}
