import { BaseDocument } from '../../../../shared/firestore/base-document';

export const CHEQUE_KINDS = ['cheque', 'promissoryNote'] as const;
export type ChequeKind = (typeof CHEQUE_KINDS)[number];

/** received: taken from an owner; issued: given to a supplier. */
export const CHEQUE_DIRECTIONS = ['received', 'issued'] as const;
export type ChequeDirection = (typeof CHEQUE_DIRECTIONS)[number];

export const CHEQUE_STATUSES = [
  'portfolio',
  'deposited',
  'endorsed',
  'collected',
  'issued',
  'paid',
  'bounced',
  'cancelled',
] as const;
export type ChequeStatus = (typeof CHEQUE_STATUSES)[number];

/** Allowed next statuses. Collected/paid/cancelled/endorsed are final. */
export const CHEQUE_TRANSITIONS: Record<ChequeDirection, Partial<Record<ChequeStatus, ChequeStatus[]>>> = {
  received: {
    portfolio: ['deposited', 'endorsed', 'collected', 'bounced', 'cancelled'],
    deposited: ['collected', 'bounced', 'portfolio'],
    bounced: ['collected', 'portfolio', 'cancelled'],
  },
  issued: {
    issued: ['paid', 'bounced', 'cancelled'],
    bounced: ['paid', 'cancelled'],
  },
};

/** Statuses where money is still expected to move; these appear on the payment calendar. */
export const CHEQUE_OPEN_STATUSES: ChequeStatus[] = ['portfolio', 'deposited', 'issued', 'bounced'];

export interface ChequeStatusChange {
  status: ChequeStatus;
  at: string;
  by: string;
  remark: string | null;
}

export interface Cheque extends BaseDocument {
  kind: ChequeKind;
  direction: ChequeDirection;
  customerId: string | null;
  supplierId: string | null;
  amount: number;
  issueDate: string;
  dueDate: string;
  serialNo: string | null;
  bankName: string | null;
  /** Keşideci / borçlu as written on the paper. */
  drawer: string | null;
  /** Who the cheque was endorsed to (ciro). */
  endorsedTo: string | null;
  status: ChequeStatus;
  remark: string | null;
  /** The collection/payment record created when the cheque is settled. */
  collectionId: string | null;
  history: ChequeStatusChange[];
}

export interface ChequeListItem extends Cheque {
  partyName: string;
  overdue: boolean;
}
