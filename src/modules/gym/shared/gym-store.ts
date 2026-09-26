import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import {
  BaseDocument,
  createBaseFields,
  isDeleted,
  omitUndefined,
  touchBaseFields,
} from '../../../shared/firestore/base-document';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { PagingQueryDto } from '../../../shared/http/paging.dto';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { gymCollection, listUndeleted } from './gym-collection';

@Injectable()
export class GymStore {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  collection(name: string) {
    return gymCollection(this.firebase, this.tenantContext, name);
  }

  tenantId(): string {
    return this.tenantContext.getTenantId();
  }

  userId(): string {
    return this.tenantContext.getUserId();
  }

  async create<T extends BaseDocument>(name: string, fields: object): Promise<T> {
    const ref = this.collection(name).doc();
    const item = {
      ...createBaseFields(ref.id, this.userId()),
      tenantId: this.tenantId(),
      ...omitUndefined(fields as Record<string, unknown>),
    };
    await ref.set(item);
    return item as unknown as T;
  }

  async getOrThrow<T extends BaseDocument>(name: string, id: string, code: ErrorCode, message: string): Promise<T> {
    const snapshot = await this.collection(name).doc(id).get();
    const item = snapshot.exists ? (snapshot.data() as T) : null;
    if (!item || isDeleted(item)) {
      throw new AppException(code, message);
    }
    return item;
  }

  list<T extends BaseDocument>(name: string) {
    return listUndeleted<T>(this.collection(name));
  }

  async page<T extends BaseDocument>(name: string, query: PagingQueryDto, filter?: (item: T) => boolean) {
    const items = await this.list<T>(name);
    const filtered = filter ? items.filter(filter) : items;
    return paginateInMemory(filtered, query.limit ?? 100, query.cursor);
  }

  async update<T extends BaseDocument>(
    name: string,
    id: string,
    code: ErrorCode,
    message: string,
    patch: object,
  ): Promise<T> {
    const current = await this.getOrThrow<T>(name, id, code, message);
    const updated = {
      ...current,
      ...omitUndefined(patch as Record<string, unknown>),
      ...touchBaseFields(this.userId()),
    } as T;
    await this.collection(name).doc(id).set(updated);
    return updated;
  }

  async save<T extends BaseDocument>(name: string, item: T): Promise<T> {
    const updated = { ...item, ...touchBaseFields(this.userId()) };
    await this.collection(name).doc(item.id).set(updated);
    return updated;
  }

  async softDelete(name: string, id: string, code: ErrorCode, message: string) {
    await this.getOrThrow(name, id, code, message);
    await this.collection(name)
      .doc(id)
      .update({
        deletedAt: new Date().toISOString(),
        ...touchBaseFields(this.userId()),
      });
    return { id };
  }

  async upsertSingleton<T extends BaseDocument>(name: string, fields: object): Promise<T> {
    const id = this.tenantId();
    const ref = this.collection(name).doc(id);
    const snapshot = await ref.get();
    const base = snapshot.exists
      ? (snapshot.data() as T)
      : ({ ...createBaseFields(id, this.userId()), tenantId: this.tenantId() } as unknown as T);
    const item = {
      ...base,
      ...omitUndefined(fields as Record<string, unknown>),
      id,
      tenantId: this.tenantId(),
      ...touchBaseFields(this.userId()),
    } as T;
    await ref.set(item);
    return item;
  }

  async getSingleton<T extends BaseDocument>(name: string): Promise<T | null> {
    const snapshot = await this.collection(name).doc(this.tenantId()).get();
    const item = snapshot.exists ? (snapshot.data() as T) : null;
    if (!item || isDeleted(item)) {
      return null;
    }
    return item;
  }
}
