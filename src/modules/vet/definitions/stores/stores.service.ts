import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { DefinitionService } from '../shared/definition.service';
import { CreateStoreDto, UpdateStoreDto } from './store.dto';
import { Store } from './store.entity';
import { StoresRepository } from './stores.repository';

@Injectable()
export class StoresService extends DefinitionService<Store, CreateStoreDto, UpdateStoreDto> {
  protected override readonly references = [
    { collection: TENANT_COLLECTION.products, field: 'storeId', label: 'ürün' },
  ];

  constructor(repository: StoresRepository) {
    super(repository);
  }
}
