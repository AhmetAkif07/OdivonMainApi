import { BaseDocument } from '../../../shared/firestore/base-document';

export const SURGERY_STATUSES = ['planned', 'inProgress', 'completed', 'cancelled'] as const;
export type SurgeryStatus = (typeof SURGERY_STATUSES)[number];

/** ASA physical status 1-5; `emergency` adds the "E" suffix. */
export interface SurgeryAnesthesia {
  asaClass: number | null;
  emergency: boolean;
  /** Premedication / induction / maintenance as written by the vet. */
  protocol: string | null;
  agents: string | null;
  monitoring: string | null;
}

/** Times of day, HH:mm, on the surgery date (recovery may pass midnight). */
export interface SurgeryTimes {
  anesthesiaStart: string | null;
  surgeryStart: string | null;
  surgeryEnd: string | null;
  recoveryEnd: string | null;
}

export interface SurgeryChecklistItem {
  key: string;
  label: string;
  done: boolean;
}

export interface Surgery extends BaseDocument {
  date: string;
  patientId: string;
  patientName: string;
  customerId: string;
  customerName: string;
  examinationId: string | null;
  /** e.g. "Ovariohisterektomi" */
  type: string;
  description: string | null;
  surgeonId: string | null;
  surgeonName: string | null;
  assistantIds: string[];
  assistantNames: string[];
  anesthesia: SurgeryAnesthesia;
  times: SurgeryTimes;
  /** Minutes between surgeryStart and surgeryEnd, when both are set. */
  durationMinutes: number | null;
  checklist: SurgeryChecklistItem[];
  complications: string | null;
  postOpNotes: string | null;
  status: SurgeryStatus;
}

export const DEFAULT_CHECKLIST: ReadonlyArray<Omit<SurgeryChecklistItem, 'done'>> = [
  { key: 'consent', label: 'Onam formu imzalandı' },
  { key: 'fasting', label: 'Aç bırakıldı (yemek 8-12 saat, su 2 saat)' },
  { key: 'weight', label: 'Güncel kilo ölçüldü' },
  { key: 'bloodwork', label: 'Ameliyat öncesi kan tahlili değerlendirildi' },
  { key: 'history', label: 'Alerji ve ilaç geçmişi kontrol edildi' },
  { key: 'ivAccess', label: 'Damar yolu açıldı / sıvı başlandı' },
  { key: 'site', label: 'Operasyon bölgesi tıraşlandı ve hazırlandı' },
  { key: 'equipment', label: 'Anestezi cihazı ve oksijen kontrol edildi' },
];
