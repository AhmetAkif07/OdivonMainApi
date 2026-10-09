import { BaseDocument } from '../../../../shared/firestore/base-document';

export const GROOMING_STATUSES = ['waiting', 'in_progress', 'completed', 'cancelled'] as const;
export type GroomingStatus = (typeof GROOMING_STATUSES)[number];

export const GROOMING_TEMPERAMENTS = ['calm', 'nervous', 'aggressive'] as const;
export type GroomingTemperament = (typeof GROOMING_TEMPERAMENTS)[number];

export interface GroomingAppointment extends BaseDocument {
  date: string;
  time: string;
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  patientId: string;
  patientName: string;
  animalType?: string | null;
  patientBreed?: string | null;
  staffId: string;
  staffName: string;
  serviceId: string;
  serviceName: string;
  price: number;
  commissionRate: number;
  commissionAmount: number;
  status: GroomingStatus;
  temperament?: GroomingTemperament;
  specialNotes?: string | null;
  durationMinutes?: number;
  saleId?: string | null;
}

export interface GroomingStaff extends BaseDocument {
  name: string;
  title: string;
  commissionRate: number;
  phone?: string | null;
  active: boolean;
}

export interface GroomingServiceItem {
  id: string;
  name: string;
  category: string;
  icon?: string;
  durationMinutes: number;
  price: number;
}