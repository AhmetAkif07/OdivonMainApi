import { BaseDocument } from '../../../../shared/firestore/base-document';
import { SaleLine } from '../sales/sale.entity';

export const PROFORMA_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'converted'] as const;
export type ProformaStatus = (typeof PROFORMA_STATUSES)[number];

/** A price quote for an owner (e.g. surgery estimate). It does not touch stock or the till. */
export interface Proforma extends BaseDocument {
  number: string;
  date: string;
  validUntil: string | null;
  customerId: string;
  patientId: string | null;
  status: ProformaStatus;
  discount: number;
  remark: string | null;
  lines: SaleLine[];
  net: number;
  vat: number;
  total: number;
  /** Set once the quote is turned into a sale. */
  saleId: string | null;
}

export interface ProformaListItem extends Proforma {
  customerName: string;
  /** True when validUntil has passed and the quote was never accepted or converted. */
  expired: boolean;
}
