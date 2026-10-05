import { BaseDocument } from '../../../../shared/firestore/base-document';

export const HOTEL_STAY_STATUSES = ['reserved', 'checked_in', 'checked_out', 'cancelled', 'no_show'] as const;
export type HotelStayStatus = (typeof HOTEL_STAY_STATUSES)[number];

export interface HotelBelongingItem {
  item: string;
  description?: string;
}

export interface HotelEmergencyContact {
  name: string;
  phone: string;
  relation?: string;
}

export interface HotelStay extends BaseDocument {
  customerId: string;
  customerName: string;
  customerPhone: string;
  patientId: string;
  patientName: string;
  patientSpecies?: string;
  patientBreed?: string;
  roomId: string;
  roomName: string;
  roomType: string;
  startDate: string;
  endDate: string;
  checkInTime?: string;
  checkOutTime?: string;
  actualCheckInAt?: string | null;
  actualCheckOutAt?: string | null;
  status: HotelStayStatus;
  dailyRate: number;
  totalDays: number;
  totalAmount: number;
  dietNotes?: string | null;
  medicationNotes?: string | null;
  behaviorNotes?: string | null;
  belongings: HotelBelongingItem[];
  emergencyContact?: HotelEmergencyContact | null;
  vaccineChecked: boolean;
  extraServicesAmount?: number;
  notes?: string | null;
  saleId?: string | null;
}
