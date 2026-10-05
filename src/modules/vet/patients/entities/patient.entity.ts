import { BaseDocument } from '../../../../shared/firestore/base-document';

export type PatientSex = 'male' | 'female' | 'unknown';

export interface Patient extends BaseDocument {
  customerId: string;
  name: string;
  birthDate: string | null;
  chipNumber: string | null;
  sex: PatientSex;
  animalType: string;
  breed: string | null;
  color: string | null;
  sterilization: boolean;
  notes: string | null;
  active: boolean;
  pedigreeNo?: string | null;
  registrationClub?: string | null;
  originCountry?: string | null;
  titles?: string | null;
  motherId?: string | null;
  motherName?: string | null;
  motherPedigreeNo?: string | null;
  fatherId?: string | null;
  fatherName?: string | null;
  fatherPedigreeNo?: string | null;
  paternalGrandfatherName?: string | null;
  paternalGrandmotherName?: string | null;
  maternalGrandfatherName?: string | null;
  maternalGrandmotherName?: string | null;
}

export interface PatientListItem extends Patient {
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
}
