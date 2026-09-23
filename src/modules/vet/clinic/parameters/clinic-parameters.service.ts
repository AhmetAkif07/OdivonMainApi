import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { CashRegistersRepository } from '../../definitions/cash-registers/cash-registers.repository';
import { UpdateClinicParametersDto } from './clinic-parameters.dto';
import { ClinicParametersRepository } from './clinic-parameters.repository';

@Injectable()
export class ClinicParametersService {
  constructor(
    private readonly parameters: ClinicParametersRepository,
    private readonly cashRegisters: CashRegistersRepository,
  ) {}

  get() {
    return this.parameters.getOrCreate();
  }

  async update(dto: UpdateClinicParametersDto) {
    await this.assertRegister(dto.cashRegisterId);
    await this.assertRegister(dto.cardCashRegisterId);
    await this.assertRegister(dto.transferCashRegisterId);
    return this.parameters.update(dto);
  }

  private async assertRegister(id?: string | null) {
    if (!id) {
      return;
    }
    if (!(await this.cashRegisters.findById(id))) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Kasa bulunamadı');
    }
  }
}
