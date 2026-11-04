import { BaseDocument } from '../../../shared/firestore/base-document';

export const PAGE_PRIORITIES = ['normal', 'urgent'] as const;
export type PagePriority = (typeof PAGE_PRIORITIES)[number];

export const PAGE_TARGET_TYPES = ['user', 'role', 'all'] as const;
export type PageTargetType = (typeof PAGE_TARGET_TYPES)[number];

/** An in-clinic page ("çağrı") from one staff member to a person, a role or everyone. */
export interface ClinicPage extends BaseDocument {
  fromUserId: string;
  fromName: string;
  targetType: PageTargetType;
  targetId: string | null;
  /** Person or role name as shown in lists. */
  targetLabel: string;
  /** Resolved when sent; the sender is left out. */
  recipientIds: string[];
  priority: PagePriority;
  message: string;
  /** uid → ISO time the person acknowledged. */
  acks: Record<string, string>;
}

export interface InboxItem {
  id: string;
  createdAt: string;
  fromName: string;
  targetLabel: string;
  priority: PagePriority;
  message: string;
  acknowledgedAt: string | null;
}

export interface PageInbox {
  items: InboxItem[];
  unread: number;
  urgentUnread: number;
  serverTime: string;
}

export interface SentPage extends ClinicPage {
  ackCount: number;
  recipientCount: number;
  /** Names of recipients who have not acknowledged yet. */
  pendingNames: string[];
}

export interface PageRecipients {
  users: Array<{ uid: string; name: string }>;
  roles: Array<{ id: string; name: string; memberCount: number }>;
}
