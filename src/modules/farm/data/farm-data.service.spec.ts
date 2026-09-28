import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { farmForbidden } from '../shared/farm-errors';
import { FarmDataService } from './farm-data.service';

function storeMock(canWrite = true) {
  return {
    requireRole: jest.fn().mockResolvedValue(canWrite ? 'saha' : 'okuyucu'),
    assertCanWrite: jest.fn(async () => {
      if (!canWrite) throw farmForbidden('read only');
      return 'saha';
    }),
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn(async (_name: string, fields: object) => ({ id: 'new', ...fields })),
    createMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
    softDelete: jest.fn().mockResolvedValue({ id: 'x' }),
    restore: jest.fn().mockResolvedValue({}),
    hardDelete: jest.fn().mockResolvedValue({ id: 'x' }),
    softDeleteMany: jest.fn().mockResolvedValue({ deleted: 0 }),
  };
}

describe('FarmDataService', () => {
  it('maps client collections to tenant farm collections and passes equality filters', async () => {
    const store = storeMock();
    const service = new FarmDataService(store as never);

    await service.list('animals', { herdId: 'h1', deleted: 'false' });

    expect(store.list).toHaveBeenCalledWith(TENANT_COLLECTION.farmAnimals, {
      deleted: false,
      equals: { herdId: 'h1' },
    });
  });

  it('rejects unknown collections', async () => {
    const service = new FarmDataService(storeMock() as never);
    await expect(service.list('users', {})).rejects.toMatchObject({
      code: ErrorCode.FARM_NOT_FOUND,
    });
  });

  it('keeps read-only members out of writes but lets them add activity entries', async () => {
    const store = storeMock(false);
    const service = new FarmDataService(store as never);

    await expect(service.create('animals', { tagNo: 'TR1' })).rejects.toMatchObject({
      code: ErrorCode.FARM_FORBIDDEN,
    });
    await expect(service.create('activityLog', { action: 'x' })).resolves.toMatchObject({
      action: 'x',
    });
  });

  it('only changes members through the member endpoints', async () => {
    const service = new FarmDataService(storeMock() as never);
    await expect(service.update('members', 'u1', { role: 'admin' })).rejects.toMatchObject({
      code: ErrorCode.FARM_FORBIDDEN,
    });
  });

  it('strips server-owned fields from client bodies', async () => {
    const store = storeMock();
    const service = new FarmDataService(store as never);

    await service.update('animals', 'a1', { weight: 40, farmId: 'other', deletedAt: null });

    expect(store.update).toHaveBeenCalledWith(TENANT_COLLECTION.farmAnimals, 'a1', { weight: 40 });
  });
});
