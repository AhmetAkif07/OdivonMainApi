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
}
