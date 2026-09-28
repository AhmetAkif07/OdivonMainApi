import { Injectable } from '@nestjs/common';
import {
  FARM_DATA_COLLECTIONS,
  FarmDataCollection,
  isFarmDataCollection,
  OPEN_CREATE_COLLECTIONS,
  READ_ONLY_DATA_COLLECTIONS,
} from '../shared/farm-collections';
import { farmForbidden, farmInvalid, farmNotFound } from '../shared/farm-errors';
import { FARM_BATCH_LIMIT, FarmStore, sanitizeFarmFields } from '../shared/farm-store';

/** Query keys that are not equality filters. */
const RESERVED_QUERY_KEYS = new Set(['deleted']);

/**
 * Generic CRUD over the farm collections — the server side of OdivonFARM's
 * `FirestoreCrudService`. Every call is scoped to the caller's tenant by `FarmStore`.
 */
@Injectable()
export class FarmDataService {
  constructor(private readonly store: FarmStore) {}

  async list(collection: string, query: Record<string, unknown>) {
    const name = this.resolve(collection);
    await this.store.requireRole();
    const equals: Record<string, string> = {};
    for (const [key, value] of Object.entries(query ?? {})) {
      if (RESERVED_QUERY_KEYS.has(key) || typeof value !== 'string') continue;
      equals[key] = value;
    }
    return this.store.list(name, { deleted: query?.['deleted'] === 'true', equals });
  }

  async get(collection: string, id: string) {
    const name = this.resolve(collection);
    await this.store.requireRole();
    return this.store.getOrThrow(name, id);
  }

  async create(collection: string, body: unknown) {
    const name = this.resolveWritable(collection);
    await this.assertCanCreate(collection as FarmDataCollection);
    return this.store.create(name, sanitizeFarmFields(body));
  }

  async createMany(collection: string, items: unknown[]) {
    const name = this.resolveWritable(collection);
    this.assertBatchSize(items.length);
    await this.assertCanCreate(collection as FarmDataCollection);
    return this.store.createMany(name, items.map(sanitizeFarmFields));
  }

  async update(collection: string, id: string, body: unknown) {
    const name = this.resolveWritable(collection);
    await this.store.assertCanWrite();
    const fields = sanitizeFarmFields(body);
    if (Object.keys(fields).length === 0) throw farmInvalid('Güncellenecek alan yok.');
    return this.store.update(name, id, fields);
  }

  async softDelete(collection: string, id: string) {
    const name = this.resolveWritable(collection);
    await this.store.assertCanWrite();
    return this.store.softDelete(name, id);
  }

  async softDeleteMany(collection: string, ids: string[]) {
    const name = this.resolveWritable(collection);
    this.assertBatchSize(ids.length);
    await this.store.assertCanWrite();
    return this.store.softDeleteMany(name, [...new Set(ids)]);
  }

  async restore(collection: string, id: string) {
    const name = this.resolveWritable(collection);
    await this.store.assertCanWrite();
    return this.store.restore(name, id);
  }

  async hardDelete(collection: string, id: string) {
    const name = this.resolveWritable(collection);
    await this.store.assertCanWrite();
    return this.store.hardDelete(name, id);
  }

  private resolve(collection: string): string {
    if (!isFarmDataCollection(collection)) throw farmNotFound('Bilinmeyen veri koleksiyonu.');
    return FARM_DATA_COLLECTIONS[collection];
  }

  private resolveWritable(collection: string): string {
    const name = this.resolve(collection);
    if (READ_ONLY_DATA_COLLECTIONS.has(collection as FarmDataCollection)) {
      throw farmForbidden('Bu kayıtlar yalnızca kendi uç noktalarından değiştirilebilir.');
    }
    return name;
  }

  private async assertCanCreate(collection: FarmDataCollection) {
    if (OPEN_CREATE_COLLECTIONS.has(collection)) {
      await this.store.requireRole();
    } else {
      await this.store.assertCanWrite();
    }
  }

  private assertBatchSize(size: number) {
    if (size === 0) throw farmInvalid('En az bir kayıt gönderilmelidir.');
    if (size > FARM_BATCH_LIMIT) {
      throw farmInvalid(`Tek seferde en fazla ${FARM_BATCH_LIMIT} kayıt işlenebilir.`);
    }
  }
}
