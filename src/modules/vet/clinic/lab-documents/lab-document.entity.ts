import { BaseDocument } from '../../../../shared/firestore/base-document';

export interface LabDocument extends BaseDocument {
  customerId: string;
  customerName: string;
  patientId: string;
  patientName: string;
  fileName: string;
  url: string;
  remark: string | null;
  read: boolean;
}
