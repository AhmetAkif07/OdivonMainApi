import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { GymReceivablesService, OpeningSaleInput } from '../ops/receivables.service';
import {
  CancelMemberDto,
  CreateMemberDto,
  FreezeMemberDto,
  ListMembersQueryDto,
  RenewMemberDto,
  UpdateMemberDto,
} from './member.dto';
import { AccessSyncService } from '../access/access-sync.service';
import { GymMember } from './member.entity';
import { MembersRepository } from './members.repository';

@Injectable()
export class MembersService {
  constructor(
    private readonly members: MembersRepository,
    private readonly accessSync: AccessSyncService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Creates the member and, for an active membership, settles the package sold with it: the paid
   * amount goes to accounting and an unpaid remainder becomes debt (see `openingSale`).
   */
  async create(dto: CreateMemberDto) {
    const sale = openingSaleOf(dto);
    const receivables = sale ? this.receivables() : null;
    if (sale && receivables) {
      // Reject a bad price/date before the login account is created.
      await receivables.assertOpeningSale(sale);
    }
    const created = await this.members.create(dto);
    const member = sale && receivables ? await receivables.openingSale(created, sale) : created;
    return this.synced(member);
  }

  /** Resolved lazily: the ops module (receivables) already depends on this module. */
  private receivables(): GymReceivablesService {
    return this.moduleRef.get(GymReceivablesService, { strict: false });
  }

  getById(id: string) {
    return this.members.getByIdOrThrow(id);
  }

  async list(query: ListMembersQueryDto) {
    const items = await this.members.list(query);
    return paginateInMemory(items, query.limit ?? 100, query.cursor);
  }

  async update(id: string, dto: UpdateMemberDto) {
    return this.synced(await this.members.update(id, dto));
  }

  async remove(id: string) {
    const member = await this.members.getByIdOrThrow(id);
    await this.members.softDelete(id);
    await this.synced({ ...member, deletedAt: new Date().toISOString() });
    return { id };
  }

  async renew(id: string, dto: RenewMemberDto) {
    const member = await this.members.getByIdOrThrow(id);
    const base = membershipEndDate(member.membershipEndsAt);
    base.setDate(base.getDate() + dto.durationDays);
    const note = `[Abonelik Yenileme]: ${dto.packageName} (${dto.durationDays} gün)`;
    return this.saveSynced({
      ...member,
      membershipStatus: 'active',
      packageLabel: dto.packageName,
      membershipEndsAt: base.toISOString(),
      notes: joinNotes(member.notes, dto.notes ? `${note} - ${dto.notes}` : note),
    });
  }

  async freeze(id: string, dto: FreezeMemberDto) {
    const member = await this.members.getByIdOrThrow(id);
    const base = membershipEndDate(member.membershipEndsAt);
    base.setDate(base.getDate() + dto.freezeDays);
    const note = `[Donduruldu]: ${dto.freezeDays} gün (${dto.reason || 'Üye talebi'})`;
    return this.saveSynced({
      ...member,
      membershipEndsAt: base.toISOString(),
      notes: joinNotes(member.notes, note),
    });
  }

  async cancel(id: string, dto: CancelMemberDto) {
    const member = await this.members.getByIdOrThrow(id);
    const note = `[İptal Edildi]: ${dto.reason || 'Yönetici tarafından iptal edildi.'}`;
    return this.saveSynced({
      ...member,
      membershipStatus: 'cancelled',
      notes: joinNotes(member.notes, note),
    });
  }

  private async saveSynced(member: GymMember) {
    return this.synced(await this.members.save(member));
  }

  /** Recomputes the member's desired state on every user-sync capable turnstile. */
  private async synced<T extends GymMember>(member: T): Promise<T> {
    await this.accessSync.syncMemberSafely(member);
    return member;
  }
}

function membershipEndDate(value: string | null): Date {
  if (value) {
    const current = new Date(value);
    if (!Number.isNaN(current.getTime()) && current.getTime() > Date.now()) {
      return current;
    }
  }
  return new Date();
}

function joinNotes(existing: string | null, extra: string): string {
  return existing ? `${existing}\n${extra}` : extra;
}

/**
 * The sale part of a new-member request. Only an active membership sells something: a catalogue
 * package (`packageId`) or a custom one whose typed price is the sale amount.
 */
function openingSaleOf(dto: CreateMemberDto): OpeningSaleInput | null {
  if (dto.membershipStatus !== 'active') return null;
  if (!dto.packageId && !(Number(dto.packagePrice) > 0)) return null;
  return {
    packageId: dto.packageId ?? null,
    paidAmount: dto.packageId ? (dto.paidAmount ?? null) : null,
    customPrice: dto.packageId ? null : Number(dto.packagePrice),
    paymentMethod: dto.paymentMethod,
    installmentCount: dto.debtInstallments,
    firstDueDate: dto.debtDueDate,
  };
}
