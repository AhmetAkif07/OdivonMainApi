import { Injectable } from '@nestjs/common';
import { AuditAction } from '../../../shared/audit/audit.types';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { isDeleted } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { IdentityRepository } from '../../identity/identity.repository';
import { DocStoreConfig, TenantDocStore } from '../shared/tenant-doc-store';
import { InboxQueryDto, SendPageDto } from './paging.dto';
import { ClinicPage, PageInbox, PageRecipients, SentPage } from './paging.entity';

const DAY_MS = 86_400_000;
const INBOX_WINDOW_MS = DAY_MS;
const SENT_WINDOW_MS = 7 * DAY_MS;
const MAX_ITEMS = 50;

@Injectable()
export class ClinicPagesRepository extends TenantDocStore<ClinicPage> {
  protected readonly config: DocStoreConfig = {
    collection: TENANT_COLLECTION.clinicPages,
    entity: 'clinicPage',
    notFound: ErrorCode.CLINIC_PAGE_NOT_FOUND,
    notFoundMessage: 'Çağrı bulunamadı',
    actions: {
      created: AuditAction.CLINIC_PAGE_SENT,
      updated: AuditAction.CLINIC_PAGE_SENT,
      deleted: AuditAction.CLINIC_PAGE_SENT,
    },
  };

  async roles(): Promise<Array<{ id: string; name: string }>> {
    const snapshot = await this.firebase.db
      .collection(tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.roles))
      .get();
    return snapshot.docs
      .map((doc) => doc.data() as { id: string; name?: string; deletedAt?: string | null })
      .filter((role) => !isDeleted(role))
      .map((role) => ({ id: role.id, name: role.name ?? '' }));
  }
}

interface StaffUser {
  uid: string;
  name: string;
  roleIds: string[];
}

@Injectable()
export class PagingService {
  constructor(
    private readonly pages: ClinicPagesRepository,
    private readonly identity: IdentityRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  private async staff(): Promise<StaffUser[]> {
    const users = await this.identity.listByCurrentTenant();
    return users
      .filter((user) => user.status === 'active' && user.accountType !== 'gym_member')
      .map((user) => ({ uid: user.uid, name: user.displayName || user.email, roleIds: user.roleIds ?? [] }));
  }

  async recipients(): Promise<PageRecipients> {
    const [staff, roles] = await Promise.all([this.staff(), this.pages.roles()]);
    const me = this.tenantContext.getUserId();
    return {
      users: staff
        .filter((user) => user.uid !== me)
        .map(({ uid, name }) => ({ uid, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
      roles: roles
        .map((role) => ({ ...role, memberCount: staff.filter((user) => user.roleIds.includes(role.id)).length }))
        .filter((role) => role.memberCount > 0)
        .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    };
  }

  async send(dto: SendPageDto): Promise<ClinicPage> {
    const me = this.tenantContext.getUserId();
    const staff = await this.staff();
    const sender = staff.find((user) => user.uid === me);
    let recipients: StaffUser[];
    let targetLabel: string;
    switch (dto.targetType) {
      case 'user': {
        const user = staff.find((item) => item.uid === dto.targetId);
        if (!user) throw new AppException(ErrorCode.VALIDATION_ERROR, 'Kişi bulunamadı');
        recipients = [user];
        targetLabel = user.name;
        break;
      }
      case 'role': {
        const role = (await this.pages.roles()).find((item) => item.id === dto.targetId);
        if (!role) throw new AppException(ErrorCode.VALIDATION_ERROR, 'Rol bulunamadı');
        recipients = staff.filter((user) => user.roleIds.includes(role.id));
        targetLabel = role.name;
        break;
      }
      case 'all':
        recipients = staff;
        targetLabel = 'Herkes';
        break;
    }
    const recipientIds = recipients.map((user) => user.uid).filter((uid) => uid !== me);
    if (!recipientIds.length) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Çağrıyı alacak kimse yok');
    }
    return this.pages.create({
      fromUserId: me,
      fromName: sender?.name ?? this.tenantContext.getStore().displayName ?? this.tenantContext.getStore().email,
      targetType: dto.targetType,
      targetId: dto.targetType === 'all' ? null : dto.targetId ?? null,
      targetLabel,
      recipientIds,
      priority: dto.priority ?? 'normal',
      message: dto.message.trim(),
      acks: {},
    });
  }

  /** Pages sent to me. Cheap enough to poll: one range query on createdAt, filtered in memory. */
  async inbox(query: InboxQueryDto, now = new Date()): Promise<PageInbox> {
    const me = this.tenantContext.getUserId();
    const floor = new Date(now.getTime() - INBOX_WINDOW_MS).toISOString();
    const since = query.since && query.since > floor ? query.since : floor;
    const items = (await this.pages.since('createdAt', since))
      .filter((page) => page.recipientIds.includes(me))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_ITEMS)
      .map((page) => ({
        id: page.id,
        createdAt: page.createdAt,
        fromName: page.fromName,
        targetLabel: page.targetLabel,
        priority: page.priority,
        message: page.message,
        acknowledgedAt: page.acks?.[me] ?? null,
      }));
    const unread = items.filter((item) => !item.acknowledgedAt);
    return {
      items,
      unread: unread.length,
      urgentUnread: unread.filter((item) => item.priority === 'urgent').length,
      serverTime: now.toISOString(),
    };
  }

  async sent(now = new Date()): Promise<SentPage[]> {
    const me = this.tenantContext.getUserId();
    const [pages, staff] = await Promise.all([
      this.pages.since('createdAt', new Date(now.getTime() - SENT_WINDOW_MS).toISOString()),
      this.staff(),
    ]);
    const names = new Map(staff.map((user) => [user.uid, user.name]));
    return pages
      .filter((page) => page.fromUserId === me)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_ITEMS)
      .map((page) => ({
        ...page,
        recipientCount: page.recipientIds.length,
        ackCount: page.recipientIds.filter((uid) => page.acks?.[uid]).length,
        pendingNames: page.recipientIds.filter((uid) => !page.acks?.[uid]).map((uid) => names.get(uid) ?? '?'),
      }));
  }

  async acknowledge(id: string): Promise<ClinicPage> {
    const me = this.tenantContext.getUserId();
    const page = await this.pages.getByIdOrThrow(id);
    if (!page.recipientIds.includes(me)) {
      throw new AppException(ErrorCode.CLINIC_PAGE_NOT_FOUND, 'Çağrı bulunamadı');
    }
    if (page.acks?.[me]) return page;
    return this.pages.saveQuietly({ ...page, acks: { ...(page.acks ?? {}), [me]: new Date().toISOString() } });
  }

  async acknowledgeAll(now = new Date()): Promise<{ acknowledged: number }> {
    const inbox = await this.inbox({}, now);
    const open = inbox.items.filter((item) => !item.acknowledgedAt);
    for (const item of open) {
      await this.acknowledge(item.id);
    }
    return { acknowledged: open.length };
  }
}
