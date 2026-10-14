import { BaseDocument } from '../../shared/firestore/base-document';

export type VehicleStatus =
  | 'available'
  | 'reserved'
  | 'rented'
  | 'maintenance'
  | 'cleaning'
  | 'out_of_service'
  | 'inactive';

export type ReservationStatus =
  | 'draft'
  | 'pending_payment'
  | 'confirmed'
  | 'cancelled'
  | 'no_show'
  | 'converted';

export type RentalStatus = 'draft' | 'checked_out' | 'overdue' | 'returned' | 'closed' | 'cancelled';

export interface RentBranch extends BaseDocument {
  tenantId: string;
  name: string;
  code: string;
  phone: string | null;
  address: string | null;
  timezone: 'Europe/Istanbul';
  active: boolean;
}

export interface RentVehicle extends BaseDocument {
  tenantId: string;
  branchId: string;
  plate: string;
  brand: string;
  model: string;
  modelYear: number;
  segment: string;
  status: VehicleStatus;
  mileage: number;
  fuelType: string;
  fuelCapacity: number | null;
  chassisNumber: string | null;
  engineNumber: string | null;
  maintenanceMileage: number | null;
  dailyPrice: number;
}

export interface RentCustomer extends BaseDocument {
  tenantId: string;
  branchId: string;
  kind: 'individual' | 'company';
  firstName: string;
  lastName: string;
  companyName: string | null;
  identityNumber: string | null;
  taxNumber: string | null;
  email: string;
  phone: string;
  address: string | null;
  driverLicenseNumber: string | null;
  driverLicenseClass: string | null;
  driverLicenseExpiresAt: string | null;
  tags: string[];
  blacklisted: boolean;
  blacklistReason: string | null;
}

export interface PriceTier {
  minDays: number;
  maxDays: number | null;
  dailyPrice: number;
}

export interface RentRatePlan extends BaseDocument {
  tenantId: string;
  branchId: string;
  name: string;
  vehicleSegment: string;
  currency: 'TRY';
  taxRate: number;
  validFrom: string;
  validTo: string;
  tiers: PriceTier[];
  active: boolean;
}

export interface PriceSnapshot {
  currency: 'TRY';
  rentalDays: number;
  baseAmount: number;
  extrasAmount: number;
  oneWayFee: number;
  discountAmount: number;
  netAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  ratePlanId: string;
  calculatedAt: string;
}

export interface RentReservation extends BaseDocument {
  tenantId: string;
  branchId: string;
  returnBranchId: string;
  vehicleId: string;
  customerId: string;
  pickupAt: string;
  returnAt: string;
  status: ReservationStatus;
  ratePlanId: string;
  extraIds: string[];
  note: string | null;
  price: PriceSnapshot;
  version: number;
}

export interface SlotEntry {
  reservationId: string;
  startAt: string;
  endAt: string;
}

export interface RentRental extends BaseDocument {
  tenantId: string;
  branchId: string;
  reservationId: string | null;
  contractNumber: string;
  vehicleId: string;
  customerId: string;
  pickupAt: string;
  expectedReturnAt: string;
  returnedAt: string | null;
  checkoutMileage: number | null;
  returnMileage: number | null;
  checkoutFuelPercent: number | null;
  returnFuelPercent: number | null;
  status: RentalStatus;
  price: PriceSnapshot;
  version: number;
}

export interface RentTransaction extends BaseDocument {
  tenantId: string;
  branchId: string;
  customerId: string | null;
  reservationId: string | null;
  rentalId: string | null;
  kind: 'charge' | 'payment' | 'deposit' | 'refund' | 'adjustment';
  method: 'cash' | 'pos' | 'bank_transfer' | 'online';
  amount: number;
  currency: 'TRY';
  note: string | null;
  reversedTransactionId: string | null;
}
