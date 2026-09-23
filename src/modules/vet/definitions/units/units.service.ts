import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { DefinitionService } from '../shared/definition.service';
import { CreateUnitDto, UpdateUnitDto } from './unit.dto';
import { Unit } from './unit.entity';
import { UnitsRepository } from './units.repository';

@Injectable()
export class UnitsService extends DefinitionService<Unit, CreateUnitDto, UpdateUnitDto> {
  protected override readonly references = [
    { collection: TENANT_COLLECTION.products, field: 'unitId', label: 'ürün' },
  ];

  constructor(repository: UnitsRepository) {
    super(repository);
  }
}
