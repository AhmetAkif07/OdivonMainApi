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
import { MembersRepository } from './members.repository';

@Injectable()
export class MembersService {
  constructor(private readonly members: MembersRepository) {}

  create(dto: CreateMemberDto) {
    return this.members.create(dto);
  }

  getById(id: string) {
    return this.members.getByIdOrThrow(id);
  }

  async list(query: ListMembersQueryDto) {
    const items = await this.members.list(query);
    return paginateInMemory(items, query.limit ?? 100, query.cursor);
  }

  update(id: string, dto: UpdateMemberDto) {
    return this.members.update(id, dto);
  }

  async remove(id: string) {
    await this.members.softDelete(id);
    return { id };
  }

  async renew(id: string, dto: RenewMemberDto) {
    const member = await this.members.getByIdOrThrow(id);
    const base = membershipEndDate(member.membershipEndsAt);
    base.setDate(base.getDate() + dto.durationDays);
    const note = `[Abonelik Yenileme]: ${dto.packageName} (${dto.durationDays} gün)`;
    return this.members.save({
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
    return this.members.save({
      ...member,
      membershipEndsAt: base.toISOString(),
      notes: joinNotes(member.notes, note),
    });
  }

  async cancel(id: string, dto: CancelMemberDto) {
    const member = await this.members.getByIdOrThrow(id);
    const note = `[İptal Edildi]: ${dto.reason || 'Yönetici tarafından iptal edildi.'}`;
    return this.members.save({
      ...member,
      membershipStatus: 'cancelled',
      notes: joinNotes(member.notes, note),
    });
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
