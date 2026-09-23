import { BaseDocument } from '../../../../shared/firestore/base-document';

export const COLLECTION_KINDS = ['collection', 'payment'] as const;
export type CollectionKind = (typeof COLLECTION_KINDS)[number];

export interface Collection extends BaseDocument {
  kind: CollectionKind;
  date: string;
  customerId: string | null;
  supplierId: string | null;
  amount: number;
  paymentMethodId: string | null;
  cashRegisterId: string | null;
  saleId: string | null;
  remark: string | null;
}

export interface CollectionListItem extends Collection {
  partyName: string;
  paymentMethodName: string;
  cashRegisterName: string;
}
