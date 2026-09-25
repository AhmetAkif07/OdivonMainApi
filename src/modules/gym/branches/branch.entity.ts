import { BaseDocument } from '../../../shared/firestore/base-document';

export interface OpeningHours {
  day: number;
  open: string;
  close: string;
  closed: boolean;
}

export interface GymBranch extends BaseDocument {
  name: string;
  logoUrl: string | null;
  address: string;
  city: string;
  postalCode: string | null;
  phone: string;
  email: string;
  website: string | null;
  capacity: number;
  currentOccupancy: number;
  openingHours: OpeningHours[];
  openDays: number[];
  features: string[];
  status: 'active' | 'closed' | 'maintenance';
  managerName: string | null;
}
