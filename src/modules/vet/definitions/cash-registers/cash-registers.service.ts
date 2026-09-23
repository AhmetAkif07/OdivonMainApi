import { Injectable } from '@nestjs/common';
import { DefinitionService } from '../shared/definition.service';
import { CreateCashRegisterDto, UpdateCashRegisterDto } from './cash-register.dto';
import { CashRegister } from './cash-register.entity';
import { CashRegistersRepository } from './cash-registers.repository';

@Injectable()
export class CashRegistersService extends DefinitionService<
  CashRegister,
  CreateCashRegisterDto,
  UpdateCashRegisterDto
> {
  constructor(repository: CashRegistersRepository) {
    super(repository);
  }
}
