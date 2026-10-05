import { BaseDocument } from '../../../../shared/firestore/base-document';

export interface HotelDailyLog extends BaseDocument {
  stayId: string;
  patientId: string;
  patientName: string;
  date: string;
  morningMeal: boolean;
  morningMealNotes?: string | null;
  eveningMeal: boolean;
  eveningMealNotes?: string | null;
  morningWalk: boolean;
  eveningWalk: boolean;
  medicationGiven: boolean;
  medicationNotes?: string | null;
  urination: 'normal' | 'abnormal' | 'none';
  defecation: 'normal' | 'diarrhea' | 'constipated' | 'none';
  mood: 'happy' | 'calm' | 'anxious' | 'aggressive' | 'lethargic';
  staffName?: string | null;
  notes?: string | null;
  photoUrl?: string | null;
  whatsAppNotified: boolean;
  whatsAppNotifiedAt?: string | null;
}
