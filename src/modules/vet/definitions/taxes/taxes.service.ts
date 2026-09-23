import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { DefinitionService } from '../shared/definition.service';
import { CreateTaxDto, UpdateTaxDto } from './tax.dto';
import { Tax } from './tax.entity';
import { TaxesRepository } from './taxes.repository';

@Injectable()
export class TaxesService extends DefinitionService<Tax, CreateTaxDto, UpdateTaxDto> {
  protected override readonly references = [
    { collection: TENANT_COLLECTION.products, field: 'taxId', label: 'ürün' },
    { collection: TENANT_COLLECTION.appointmentTypes, field: 'taxId', label: 'randevu tipi' },
  ];

  constructor(repository: TaxesRepository) {
    super(repository);
  }
}
