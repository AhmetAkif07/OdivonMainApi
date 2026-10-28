import { ProductModule } from '../../../shared/authorization/constants';

export type TicketStatus = 'pending' | 'in_progress' | 'approved' | 'completed' | 'rejected';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface SupportTicket {
  id: string;
  trackingNumber: string;
  tenantId?: string | null;
  tenantName?: string | null;
  /** Product module the ticket came from (e.g. gym, vet). */
  product?: ProductModule | null;
  productLabel?: string | null;
  userId?: string | null;
  userRole?: string | null;
  category: string;
  categoryLabel: string;
  subject: string;
  description: string;
  fullName: string;
  email: string;
  phone?: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  adminNote?: string | null;
  approvedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketGroup {
  key: string;
  label: string;
  total: number;
  /** pending + in_progress + approved */
  open: number;
  counts: Record<TicketStatus, number>;
  /** Tenant groups only: the tenant's product. */
  product?: ProductModule | null;
}
