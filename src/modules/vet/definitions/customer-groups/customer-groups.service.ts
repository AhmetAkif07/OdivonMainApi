import { Injectable } from '@nestjs/common';
import { DefinitionService } from '../shared/definition.service';
import { CreateCustomerGroupDto, UpdateCustomerGroupDto } from './customer-group.dto';
import { CustomerGroup } from './customer-group.entity';
import { CustomerGroupsRepository } from './customer-groups.repository';

@Injectable()
export class CustomerGroupsService extends DefinitionService<
  CustomerGroup,
  CreateCustomerGroupDto,
  UpdateCustomerGroupDto
> {
  constructor(repository: CustomerGroupsRepository) {
    super(repository);
  }
}
