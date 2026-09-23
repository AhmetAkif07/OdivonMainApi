import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { DefinitionRepository } from '../shared/definition.repository';
import { CreateCashRegisterDto, UpdateCashRegisterDto } from './cash-register.dto';
import { CashRegister } from './cash-register.entity';

@Injectable()
export class CashRegistersRepository extends DefinitionRepository<
  CashRegister,
  CreateCashRegisterDto,
  UpdateCashRegisterDto
> {
  protected readonly config = {
    collection: TENANT_COLLECTION.cashRegisters,
    entity: 'cashRegister',
    notFound: ErrorCode.CASH_REGISTER_NOT_FOUND,
    notFoundMessage: 'Cash register not found',
    actions: {
      created: AuditAction.CASH_REGISTER_CREATED,
      updated: AuditAction.CASH_REGISTER_UPDATED,
      deleted: AuditAction.CASH_REGISTER_DELETED,
    },
  };

  constructor(firebase: FirebaseService, tenantContext: TenantContext, audit: AuditService) {
    super(firebase, tenantContext, audit);
  }

  protected toFields(dto: CreateCashRegisterDto) {
    return { name: dto.name, active: dto.active ?? true };
  }
}
