export type TicketStatus = 'pending' | 'in_progress' | 'approved' | 'completed' | 'rejected';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface SupportTicket {
  id: string;
  trackingNumber: string;
  tenantId?: string | null;
  tenantName?: string | null;
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
