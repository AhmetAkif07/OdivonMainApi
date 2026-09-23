import { BaseDocument } from '../../../../shared/firestore/base-document';

export const CASH_DIRECTIONS = ['in', 'out'] as const;
export type CashDirection = (typeof CASH_DIRECTIONS)[number];

export interface CashMovement extends BaseDocument {
  cashRegisterId: string;
  date: string;
  direction: CashDirection;
  amount: number;
  remark: string | null;
}

export interface CashMovementListItem extends CashMovement {
  cashRegisterName: string;
}
