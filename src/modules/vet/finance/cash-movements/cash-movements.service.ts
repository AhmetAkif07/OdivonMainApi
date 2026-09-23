import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../../shared/http/paginated.result';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { CashRegistersRepository } from '../../definitions/cash-registers/cash-registers.repository';
import { CreateCashMovementDto, UpdateCashMovementDto } from './cash-movement.dto';
import { CashMovement, CashMovementListItem } from './cash-movement.entity';
import { CashMovementsRepository } from './cash-movements.repository';

@Injectable()
export class CashMovementsService {
  constructor(
    private readonly movements: CashMovementsRepository,
    private readonly cashRegisters: CashRegistersRepository,
  ) {}

  async create(dto: CreateCashMovementDto): Promise<CashMovement> {
    if (!(await this.cashRegisters.findById(dto.cashRegisterId))) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'Seçilen kasa bulunamadı');
    }
    return this.movements.create(dto);
  }

  getById(id: string): Promise<CashMovement> {
    return this.movements.getByIdOrThrow(id);
  }

  async list(query: PagingQueryDto): Promise<PaginatedResult<CashMovementListItem>> {
    const items = await this.movements.collect();
    const registers = await this.cashRegisters.findByIds(items.map((item) => item.cashRegisterId));
    const enriched = items
      .map((item) => ({
        ...item,
        cashRegisterName: registers.get(item.cashRegisterId)?.name ?? '',
      }))
      .filter((item) => matchesColumnFilters(item, query.filters));
    return paginateInMemory(enriched, query.limit, query.cursor);
  }

  async update(id: string, dto: UpdateCashMovementDto): Promise<CashMovement> {
    if (dto.cashRegisterId && !(await this.cashRegisters.findById(dto.cashRegisterId))) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'Seçilen kasa bulunamadı');
    }
    return this.movements.update(id, dto);
  }

  softDelete(id: string): Promise<void> {
    return this.movements.softDelete(id);
  }
}
