import { BaseDocument } from '../../../../shared/firestore/base-document';

export const HOTEL_ROOM_TYPES = ['standard', 'suite', 'vip_garden', 'kennel', 'quarantine'] as const;
export type HotelRoomType = (typeof HOTEL_ROOM_TYPES)[number];

export const HOTEL_ROOM_SPECIES = ['cat', 'dog', 'all', 'bird_exotic'] as const;
export type HotelRoomSpecies = (typeof HOTEL_ROOM_SPECIES)[number];

export const HOTEL_ROOM_STATUSES = ['available', 'occupied', 'cleaning', 'maintenance'] as const;
export type HotelRoomStatus = (typeof HOTEL_ROOM_STATUSES)[number];

export interface HotelRoom extends BaseDocument {
  name: string;
  code?: string | null;
  type: HotelRoomType;
  species: HotelRoomSpecies;
  capacity: number;
  dailyRate: number;
  status: HotelRoomStatus;
  features?: string[];
  notes?: string | null;
  currentStayId?: string | null;
  currentPatientName?: string | null;
  active: boolean;
}
