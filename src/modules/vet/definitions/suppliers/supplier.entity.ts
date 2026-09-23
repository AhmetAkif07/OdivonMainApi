import { DefinitionDocument } from '../shared/definition.repository';

export const SUPPLIER_INVOICE_TYPES = ['e-invoice', 'e-archive', 'paper'] as const;
export type SupplierInvoiceType = (typeof SUPPLIER_INVOICE_TYPES)[number];

export interface Supplier extends DefinitionDocument {
  companyName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  mersisNo: string | null;
  website: string | null;
  invoiceType: SupplierInvoiceType | null;
  active: boolean;
}
