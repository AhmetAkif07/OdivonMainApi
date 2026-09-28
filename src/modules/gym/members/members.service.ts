import { Injectable } from '@nestjs/common';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
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
  ) {}

  async create(dto: CreateMemberDto) {
    return this.synced(await this.members.create(dto));
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
