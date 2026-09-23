import { BaseDocument } from '../../../../shared/firestore/base-document';

export const CLINIC_PARAMETERS_ID = 'current';

export interface ClinicParameters extends BaseDocument {
  appointmentStart: string;
  appointmentEnd: string;
  appointmentInterval: number;
  sessionDuration: number;
  appointmentReminderHours: number;
  agendaReminderHours: number;
  displayVetNo: boolean;
  autoSms: boolean;
  animalBreedsRequired: boolean;
  firstInspectionRequired: boolean;
  examinationAmountZero: boolean;
  cashRegisterId: string | null;
  cardCashRegisterId: string | null;
  transferCashRegisterId: string | null;
}

export function defaultClinicParameters(id: string, userId: string, now = new Date().toISOString()): ClinicParameters {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId,
    deletedAt: null,
    appointmentStart: '09:00',
    appointmentEnd: '19:00',
    appointmentInterval: 15,
    sessionDuration: 20,
    appointmentReminderHours: 24,
    agendaReminderHours: 2,
    displayVetNo: false,
    autoSms: false,
    animalBreedsRequired: false,
    firstInspectionRequired: false,
    examinationAmountZero: false,
    cashRegisterId: null,
    cardCashRegisterId: null,
    transferCashRegisterId: null,
  };
}
