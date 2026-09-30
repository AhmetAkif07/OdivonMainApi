import { ValidationPipe } from '@nestjs/common';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { CreateBranchDto, UpdateBranchDto } from './branch.dto';
import { BranchesRepository } from './branches.repository';

/** Firestore rejects any object whose prototype is not Object.prototype (e.g. DTO class instances). */
function assertFirestorePlain(value: unknown, path = 'doc'): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertFirestorePlain(item, `${path}[${i}]`));
    return;
  }
  expect({ path, plain: Object.getPrototypeOf(value) === Object.prototype }).toEqual({ path, plain: true });
  Object.entries(value).forEach(([key, item]) => assertFirestorePlain(item, `${path}.${key}`));
}

describe('BranchesRepository', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const set = jest.fn();
  const stored: Record<string, unknown> = {};
  const collection = {
    doc: (id = 'b1') => ({
      id,
      set: async (data: object) => {
        set(data);
        stored[id] = data;
      },
      get: async () => ({ exists: !!stored[id], data: () => stored[id] }),
    }),
  };
  const firebase = { db: { collection: () => collection } };
  const tenant = new TenantContext();
  jest.spyOn(tenant, 'getTenantId').mockReturnValue('t1');
  jest.spyOn(tenant, 'getUserId').mockReturnValue('u1');
  const repo = new BranchesRepository(firebase as never, tenant);

  const body = {
    name: 'Kadıköy',
    address: 'Moda',
    city: 'İstanbul',
    phone: '5550000000',
    capacity: 120,
    openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '06:30', close: '23:00', closed: false })),
  };

  it('stores opening hours as plain objects on create and update', async () => {
    const createDto = (await pipe.transform(body, { type: 'body', metatype: CreateBranchDto })) as CreateBranchDto;
    expect(createDto.openingHours?.[0]?.constructor.name).toBe('OpeningHoursDto');
    await repo.create(createDto);
    assertFirestorePlain(set.mock.calls[0][0]);

    const updateDto = (await pipe.transform(
      { openingHours: [{ day: 1, open: '07:00', close: '22:00', closed: true }] },
      { type: 'body', metatype: UpdateBranchDto },
    )) as UpdateBranchDto;
    await repo.update('b1', updateDto);
    const updated = set.mock.calls[1][0];
    assertFirestorePlain(updated);
    expect(updated.openingHours).toEqual([{ day: 1, open: '07:00', close: '22:00', closed: true }]);
    expect(updated.name).toBe('Kadıköy');
  });

  it('keeps existing hours when an update does not send them', async () => {
    const updateDto = (await pipe.transform({ capacity: 90 }, { type: 'body', metatype: UpdateBranchDto })) as UpdateBranchDto;
    await repo.update('b1', updateDto);
    const updated = set.mock.calls.at(-1)![0];
    expect(updated.capacity).toBe(90);
    expect(updated.openingHours).toHaveLength(1);
    assertFirestorePlain(updated);
  });
});
