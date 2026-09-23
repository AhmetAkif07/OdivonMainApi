import { Injectable } from '@nestjs/common';
import { DefinitionService } from '../shared/definition.service';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './payment-method.dto';
import { PaymentMethod } from './payment-method.entity';
import { PaymentMethodsRepository } from './payment-methods.repository';

@Injectable()
export class PaymentMethodsService extends DefinitionService<
  PaymentMethod,
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto
> {
  constructor(repository: PaymentMethodsRepository) {
    super(repository);
  }
}
