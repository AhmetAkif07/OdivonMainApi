import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { DefinitionService } from '../shared/definition.service';
import { CreateSupplierDto, UpdateSupplierDto } from './supplier.dto';
import { Supplier } from './supplier.entity';
import { SuppliersRepository } from './suppliers.repository';

@Injectable()
export class SuppliersService extends DefinitionService<Supplier, CreateSupplierDto, UpdateSupplierDto> {
  protected override readonly references = [
    { collection: TENANT_COLLECTION.products, field: 'supplierId', label: 'ürün' },
  ];

  constructor(repository: SuppliersRepository) {
    super(repository);
  }
}
