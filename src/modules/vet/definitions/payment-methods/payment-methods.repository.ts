import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { DefinitionRepository } from '../shared/definition.repository';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './payment-method.dto';
import { PaymentMethod } from './payment-method.entity';

@Injectable()
export class PaymentMethodsRepository extends DefinitionRepository<
  PaymentMethod,
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto
> {
  protected readonly config = {
    collection: TENANT_COLLECTION.paymentMethods,
    entity: 'paymentMethod',
    notFound: ErrorCode.PAYMENT_METHOD_NOT_FOUND,
    notFoundMessage: 'Payment method not found',
    actions: {
      created: AuditAction.PAYMENT_METHOD_CREATED,
      updated: AuditAction.PAYMENT_METHOD_UPDATED,
      deleted: AuditAction.PAYMENT_METHOD_DELETED,
    },
  };

  constructor(firebase: FirebaseService, tenantContext: TenantContext, audit: AuditService) {
    super(firebase, tenantContext, audit);
  }

  protected toFields(dto: CreatePaymentMethodDto) {
    return { name: dto.name, remark: dto.remark ?? null };
  }
}
