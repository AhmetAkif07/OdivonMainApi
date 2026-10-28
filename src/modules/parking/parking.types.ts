import { BaseDocument } from '../../shared/firestore/base-document';

export type VehicleCategory = 'car' | 'motorcycle' | 'bicycle' | 'electric' | 'heavy';
export type SessionStatus = 'active' | 'payment_due' | 'paid' | 'exited' | 'manual_review' | 'cancelled' | 'lost_ticket';
export type LaneDirection = 'entry' | 'exit' | 'bidirectional';

export interface ParkingFacility extends BaseDocument {
  tenantId: string;
  name: string;
  code: string;
  address: string | null;
  timezone: 'Europe/Istanbul';
  capacity: number;
  occupied: number;
  active: boolean;
}

export interface ParkingZone extends BaseDocument {
  tenantId: string;
  facilityId: string;
  name: string;
  code: string;
  capacity: number;
  occupied: number;
  slotTracking: boolean;
  vehicleCategories: VehicleCategory[];
  active: boolean;
}

export interface ParkingSlot extends BaseDocument {
  tenantId: string;
  facilityId: string;
  zoneId: string;
  code: string;
  kind: 'standard' | 'disabled' | 'vip' | 'reserved' | 'electric';
  status: 'available' | 'occupied' | 'blocked';
  activeSessionId: string | null;
  active: boolean;
}

export interface ParkingLane extends BaseDocument {
  tenantId: string;
  facilityId: string;
  zoneId: string;
  name: string;
  direction: LaneDirection;
  active: boolean;
  offlineEntryPolicy: 'deny' | 'cached_rules';
  offlineExitPolicy: 'allow_with_audit';
}

export interface TariffBand {
  fromMinute: number;
  toMinute: number | null;
  priceKurus: number;
}

export interface ParkingTariff extends BaseDocument {
  tenantId: string;
  facilityId: string;
  zoneId: string | null;
  name: string;
  version: number;
  currency: 'TRY';
  vehicleCategories: VehicleCategory[];
  graceMinutes: number;
  dailyCapKurus: number | null;
  lostTicketFeeKurus: number;
  bands: TariffBand[];
  active: boolean;
}

export interface ParkingQuote {
  currency: 'TRY';
  durationMinutes: number;
  graceMinutes: number;
  subtotalKurus: number;
  dailyCapApplied: boolean;
  totalKurus: number;
  tariffId: string;
  tariffVersion: number;
  calculatedAt: string;
  lines: Array<{ label: string; amountKurus: number }>;
}

export interface ParkingSession extends BaseDocument {
  tenantId: string;
  facilityId: string;
  zoneId: string;
  slotId: string | null;
  entryLaneId: string | null;
  exitLaneId: string | null;
  plate: string | null;
  ticketCode: string;
  vehicleCategory: VehicleCategory;
  source: 'operator' | 'agent';
  status: SessionStatus;
  enteredAt: string;
  paidAt: string | null;
  exitedAt: string | null;
  quote: ParkingQuote | null;
  paidKurus: number;
  version: number;
}

export interface ParkingPayment extends BaseDocument {
  tenantId: string;
  facilityId: string;
  sessionId: string;
  cashShiftId: string;
  method: 'cash' | 'external_pos';
  amountKurus: number;
  currency: 'TRY';
  status: 'completed' | 'refunded';
  refundedAt: string | null;
  refundReason: string | null;
}

export interface ParkingCashShift extends BaseDocument {
  tenantId: string;
  facilityId: string;
  openedBy: string;
  openedAt: string;
  openingFloatKurus: number;
  status: 'open' | 'closed';
  closedAt: string | null;
  expectedCashKurus: number | null;
  countedCashKurus: number | null;
  differenceKurus: number | null;
}

