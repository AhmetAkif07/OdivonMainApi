import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../shared/http/column-filters';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../shared/http/paginated.result';
import { BaseDocument } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { IdentityRepository } from '../../identity/identity.repository';
import {
  CreateLeaveDto,
  CreateShiftDto,
  DateRangeQueryDto,
  DecideLeaveDto,
  LeaveQueryDto,
  UpdateLeaveDto,
  UpdateShiftDto,
} from './staff.dto';
import { LeaveBalance, RosterDay, StaffLeave, StaffMember, StaffShift } from './staff.entity';
import { StaffLeavesRepository, StaffShiftsRepository } from './staff.repository';
import { countLeaveDays, eachDay, shiftsOverlap, toDay } from './staff.schedule';

const MAX_RANGE_DAYS = 93;

@Injectable()
export class StaffService {
  constructor(
    private readonly shifts: StaffShiftsRepository,
    private readonly leaves: StaffLeavesRepository,
    private readonly identity: IdentityRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  /** Users of the clinic who can be put on the rota. */
  async members(): Promise<StaffMember[]> {
    return (await this.identity.listByCurrentTenant())
      .map((user) => ({
        userId: user.uid,
        name: user.displayName || user.email,
        email: user.email,
        active: user.status !== 'inactive',
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'tr'));
  }

  // --- Shifts -------------------------------------------------------------

  async createShift(dto: CreateShiftDto): Promise<StaffShift> {
    const member = await this.member(dto.userId);
    const draft = {
      userId: member.userId,
      staffName: member.name,
      date: toDay(dto.date),
      startTime: dto.startTime,
      endTime: dto.endTime,
      type: dto.type ?? 'regular',
      branchId: dto.branchId || null,
      remark: dto.remark || null,
    };
    await this.assertShiftFree(draft);
    return this.shifts.create(draft);
  }

  async updateShift(id: string, dto: UpdateShiftDto): Promise<StaffShift> {
    const current = await this.shifts.getByIdOrThrow(id);
    const member = dto.userId && dto.userId !== current.userId ? await this.member(dto.userId) : null;
    const next: StaffShift = {
      ...current,
      userId: member?.userId ?? current.userId,
      staffName: member?.name ?? current.staffName,
      date: dto.date ? toDay(dto.date) : current.date,
      startTime: dto.startTime ?? current.startTime,
      endTime: dto.endTime ?? current.endTime,
      type: dto.type ?? current.type,
      branchId: dto.branchId !== undefined ? dto.branchId || null : current.branchId,
      remark: dto.remark !== undefined ? dto.remark || null : current.remark,
    };
    await this.assertShiftFree(next, current.id);
    return this.shifts.save(next);
  }

  async listShifts(query: DateRangeQueryDto): Promise<StaffShift[]> {
    const [from, to] = this.range(query);
    return (await this.shifts.collect())
      .filter((item) => item.date >= from && item.date <= to && (!query.userId || item.userId === query.userId))
      .sort((left, right) => left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime));
  }

  async removeShift(id: string): Promise<void> {
    await this.shifts.softDelete(await this.shifts.getByIdOrThrow(id));
  }

  // --- Leaves -------------------------------------------------------------

  async createLeave(dto: CreateLeaveDto): Promise<StaffLeave> {
    const member = await this.member(dto.userId);
    const [startDate, endDate] = this.leaveRange(dto.startDate, dto.endDate);
    await this.assertLeaveFree(member.userId, startDate, endDate);
    return this.leaves.create({
      userId: member.userId,
      staffName: member.name,
      type: dto.type,
      startDate,
      endDate,
      days: dto.days ?? countLeaveDays(startDate, endDate),
      status: 'pending',
      remark: dto.remark || null,
      decidedBy: null,
      decidedAt: null,
    });
  }

  async updateLeave(id: string, dto: UpdateLeaveDto): Promise<StaffLeave> {
    const current = await this.leaves.getByIdOrThrow(id);
    if (current.status !== 'pending') {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Yalnızca bekleyen izin değiştirilebilir');
    }
    const member = dto.userId && dto.userId !== current.userId ? await this.member(dto.userId) : null;
    const [startDate, endDate] = this.leaveRange(dto.startDate ?? current.startDate, dto.endDate ?? current.endDate);
    const userId = member?.userId ?? current.userId;
    await this.assertLeaveFree(userId, startDate, endDate, current.id);
    const rangeChanged = startDate !== current.startDate || endDate !== current.endDate;
    return this.leaves.save({
      ...current,
      userId,
      staffName: member?.name ?? current.staffName,
      type: dto.type ?? current.type,
      startDate,
      endDate,
      days: dto.days ?? (rangeChanged ? countLeaveDays(startDate, endDate) : current.days),
      remark: dto.remark !== undefined ? dto.remark || null : current.remark,
    });
  }

  async decideLeave(id: string, dto: DecideLeaveDto): Promise<StaffLeave> {
    const current = await this.leaves.getByIdOrThrow(id);
    const allowed = current.status === 'pending' || (current.status === 'approved' && dto.status === 'cancelled');
    if (!allowed) {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Bu izin için karar zaten verilmiş');
    }
    return this.leaves.save({
      ...current,
      status: dto.status,
      remark: dto.remark !== undefined ? dto.remark || null : current.remark,
      decidedBy: this.tenantContext.getUserId(),
      decidedAt: new Date().toISOString(),
    });
  }

  async listLeaves(query: LeaveQueryDto): Promise<PaginatedResult<StaffLeave>> {
    const items = (await this.leaves.collect())
      .filter((item) => (!query.status || item.status === query.status) && (!query.userId || item.userId === query.userId))
      .filter((item) => matchesColumnFilters(item, query.filters))
      .sort((left, right) => right.startDate.localeCompare(left.startDate) || right.id.localeCompare(left.id));
    return paginateInMemory(items, query.limit, query.cursor);
  }

  async removeLeave(id: string): Promise<void> {
    const current = await this.leaves.getByIdOrThrow(id);
    if (current.status === 'approved') {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Onaylı izin silinemez, iptal edin');
    }
    await this.leaves.softDelete(current);
  }

  /** Used and pending leave days per person for one year (approved leaves count as used). */
  async leaveBalances(year: number): Promise<LeaveBalance[]> {
    const prefix = String(year);
    const balances = new Map<string, LeaveBalance>();
    for (const item of await this.leaves.collect()) {
      if (!item.startDate.startsWith(prefix) || (item.status !== 'approved' && item.status !== 'pending')) {
        continue;
      }
      const entry = balances.get(item.userId) ?? {
        userId: item.userId,
        staffName: item.staffName,
        year,
        annualUsed: 0,
        annualPending: 0,
        sickUsed: 0,
        otherUsed: 0,
      };
      if (item.status === 'pending') {
        if (item.type === 'annual') entry.annualPending += item.days;
      } else if (item.type === 'annual') entry.annualUsed += item.days;
      else if (item.type === 'sick') entry.sickUsed += item.days;
      else entry.otherUsed += item.days;
      balances.set(item.userId, entry);
    }
    return [...balances.values()].sort((left, right) => left.staffName.localeCompare(right.staffName, 'tr'));
  }

  // --- Roster -------------------------------------------------------------

  /** Day-by-day view of shifts and approved or pending leaves. */
  async roster(query: DateRangeQueryDto): Promise<RosterDay[]> {
    const [from, to] = this.range(query);
    const [shifts, leaves] = await Promise.all([this.listShifts(query), this.leaves.collect()]);
    const relevant = leaves.filter(
      (item) =>
        (item.status === 'approved' || item.status === 'pending') &&
        item.startDate <= to &&
        item.endDate >= from &&
        (!query.userId || item.userId === query.userId),
    );
    return eachDay(from, to).map((date) => ({
      date,
      shifts: shifts.filter((item) => item.date === date),
      leaves: relevant.filter((item) => item.startDate <= date && item.endDate >= date),
    }));
  }

  // --- Helpers ------------------------------------------------------------

  private async member(userId: string): Promise<StaffMember> {
    const found = (await this.members()).find((item) => item.userId === userId);
    if (!found) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Seçilen personel bu klinikte bulunamadı');
    }
    return found;
  }

  private async assertShiftFree(shift: Omit<StaffShift, keyof BaseDocument>, ignoreId?: string) {
    const clash = (await this.shifts.collect()).find(
      (item) => item.id !== ignoreId && item.userId === shift.userId && shiftsOverlap(item, shift),
    );
    if (clash) {
      throw new AppException(
        ErrorCode.SCHEDULE_CONFLICT,
        `${shift.staffName} için ${clash.date} ${clash.startTime}-${clash.endTime} vardiyası ile çakışıyor`,
      );
    }
    const leave = (await this.leaves.collect()).find(
      (item) =>
        item.userId === shift.userId &&
        item.status === 'approved' &&
        item.startDate <= shift.date &&
        item.endDate >= shift.date,
    );
    if (leave) {
      throw new AppException(ErrorCode.SCHEDULE_CONFLICT, `${shift.staffName} ${shift.date} tarihinde izinli`);
    }
  }

  private async assertLeaveFree(userId: string, startDate: string, endDate: string, ignoreId?: string) {
    const clash = (await this.leaves.collect()).find(
      (item) =>
        item.id !== ignoreId &&
        item.userId === userId &&
        (item.status === 'approved' || item.status === 'pending') &&
        item.startDate <= endDate &&
        item.endDate >= startDate,
    );
    if (clash) {
      throw new AppException(
        ErrorCode.SCHEDULE_CONFLICT,
        `Bu tarihlerde zaten bir izin kaydı var (${clash.startDate} – ${clash.endDate})`,
      );
    }
  }

  private leaveRange(start: string, end: string): [string, string] {
    const startDate = toDay(start);
    const endDate = toDay(end);
    if (endDate < startDate) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'İzin bitişi başlangıçtan önce olamaz');
    }
    return [startDate, endDate];
  }

  private range(query: DateRangeQueryDto): [string, string] {
    const from = toDay(query.from);
    const to = toDay(query.to);
    if (from > to) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Başlangıç tarihi bitişten sonra olamaz');
    }
    if (eachDay(from, to).length > MAX_RANGE_DAYS) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, `En fazla ${MAX_RANGE_DAYS} günlük aralık seçilebilir`);
    }
    return [from, to];
  }
}
