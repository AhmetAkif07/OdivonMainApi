import { BaseDocument } from '../../../shared/firestore/base-document';

export const SHIFT_TYPES = ['regular', 'onCall', 'night'] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

export interface StaffShift extends BaseDocument {
  userId: string;
  staffName: string;
  /** Day the shift starts, YYYY-MM-DD. */
  date: string;
  /** HH:mm. An end before the start means the shift runs past midnight. */
  startTime: string;
  endTime: string;
  type: ShiftType;
  branchId: string | null;
  remark: string | null;
}

export const LEAVE_TYPES = ['annual', 'sick', 'unpaid', 'excuse', 'other'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export interface StaffLeave extends BaseDocument {
  userId: string;
  staffName: string;
  type: LeaveType;
  /** Inclusive range, YYYY-MM-DD. */
  startDate: string;
  endDate: string;
  /** Leave days charged; defaults to the days in the range except Sundays. */
  days: number;
  status: LeaveStatus;
  remark: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface StaffMember {
  userId: string;
  name: string;
  email: string;
  active: boolean;
}

export interface RosterDay {
  date: string;
  shifts: StaffShift[];
  leaves: StaffLeave[];
}

export interface LeaveBalance {
  userId: string;
  staffName: string;
  year: number;
  annualUsed: number;
  annualPending: number;
  sickUsed: number;
  otherUsed: number;
}
