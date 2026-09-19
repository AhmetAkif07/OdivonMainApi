import { Injectable } from '@nestjs/common';
import { Query } from 'firebase-admin/firestore';
import { AuditService } from '../../../shared/audit/audit.service';
import { AuditAction } from '../../../shared/audit/audit.types';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import {
  createBaseFields,
  isDeleted,
  touchBaseFields,
} from '../../../shared/firestore/base-document';
import { paginateQuery } from '../../../shared/firestore/paginate';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ListCustomersQueryDto } from './dto/list-customers.query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Customer } from './entities/customer.entity';

@Injectable()
export class CustomersRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.customers),
    );
  }

  async create(dto: CreateCustomerDto): Promise<Customer> {
    const ref = this.collection().doc();
    const customer: Customer = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      email: dto.email ?? null,
      address: dto.address ?? null,
      note: dto.note ?? null,
      discountRate: dto.discountRate ?? 0,
      isArchive: false,
    };
    await ref.set(customer);
    await this.audit.record({
      action: AuditAction.CUSTOMER_CREATED,
      entity: 'customer',
      entityId: customer.id,
    });
    return customer;
  }

  async findById(id: string): Promise<Customer | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const customer = snapshot.data() as Customer;
    if (isDeleted(customer)) {
      return null;
    }
    return customer;
  }

  async getByIdOrThrow(id: string): Promise<Customer> {
    const customer = await this.findById(id);
    if (!customer) {
      throw new AppException(ErrorCode.CUSTOMER_NOT_FOUND, 'Customer not found');
    }
    return customer;
  }

  async list(query: ListCustomersQueryDto) {
    let firestoreQuery: Query = this.collection().where('deletedAt', '==', null);
    if (typeof query.isArchive === 'boolean') {
      firestoreQuery = firestoreQuery.where('isArchive', '==', query.isArchive);
    }
    return paginateQuery<Customer>(firestoreQuery, query.limit, query.cursor);
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    const current = await this.getByIdOrThrow(id);
    const updated: Customer = {
      ...current,
      ...dto,
      email: dto.email ?? current.email,
      address: dto.address ?? current.address,
      note: dto.note ?? current.note,
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(updated);
    await this.audit.record({
      action: AuditAction.CUSTOMER_UPDATED,
      entity: 'customer',
      entityId: id,
    });
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    await this.getByIdOrThrow(id);
    await this.collection()
      .doc(id)
      .update({
        deletedAt: new Date().toISOString(),
        ...touchBaseFields(this.tenantContext.getUserId()),
      });
    await this.audit.record({
      action: AuditAction.CUSTOMER_DELETED,
      entity: 'customer',
      entityId: id,
    });
  }
}
