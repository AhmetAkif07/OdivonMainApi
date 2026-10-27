import { ErrorCode } from '../../../shared/errors/error-codes';
import { GymExercisesService } from './exercises.service';
import { SYSTEM_EXERCISES } from './system-exercises';

describe('GymExercisesService', () => {
  const store = {
    userId: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    getOrThrow: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  let service: GymExercisesService;

  const custom = [
    { id: 'g1', name: 'Hammer Row', muscleGroup: 'back', equipment: 'machine', ownerUid: null, createdAt: 'x' },
    { id: 'm1', name: 'Benim Hareketim', muscleGroup: 'core', equipment: 'other', ownerUid: 'u1', createdAt: 'x' },
    { id: 'm2', name: 'Başkasının Hareketi', muscleGroup: 'core', equipment: 'other', ownerUid: 'u2', createdAt: 'x' },
  ];

  beforeEach(() => {
    jest.resetAllMocks();
    store.userId.mockReturnValue('u1');
    store.list.mockResolvedValue(custom);
    store.create.mockImplementation(async (_name: string, fields: object) => ({ id: 'new', createdAt: 'x', ...fields }));
    store.softDelete.mockImplementation(async (_name: string, id: string) => ({ id }));
    service = new GymExercisesService(store as never);
  });

  it('has unique system ids and valid defaults', () => {
    const ids = SYSTEM_EXERCISES.map((exercise) => exercise.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SYSTEM_EXERCISES.length).toBeGreaterThan(100);
    expect(SYSTEM_EXERCISES.every((exercise) => exercise.id.startsWith('sys-ex-') && exercise.defaultSets > 0)).toBe(true);
  });

  it('shows staff the system and gym exercises but not members private ones', async () => {
    const items = await service.listForStaff({});
    const ids = items.map((item) => item.id);
    expect(ids).toContain('g1');
    expect(ids).not.toContain('m1');
    expect(ids).not.toContain('m2');
    expect(items.length).toBe(SYSTEM_EXERCISES.length + 1);
  });

  it('shows a member system, gym and only their own exercises', async () => {
    const ids = (await service.listForMember({ source: undefined })).map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(['g1', 'm1']));
    expect(ids).not.toContain('m2');
  });

  it('filters by accent-insensitive text, muscle group and equipment', async () => {
    const bySearch = await service.listForMember({ q: 'sinav' });
    expect(bySearch.map((item) => item.name)).toEqual(expect.arrayContaining(['Şınav', 'Eğimli Şınav']));
    const back = await service.listForMember({ muscleGroup: 'back', equipment: 'machine' });
    expect(back.every((item) => item.muscleGroup === 'back' && item.equipment === 'machine')).toBe(true);
    expect(back.map((item) => item.id)).toContain('g1');
  });

  it('refuses to edit built-in exercises and members private ones from the panel', async () => {
    await expect(service.updateForGym('sys-ex-bench-press', { name: 'X' })).rejects.toMatchObject({
      code: ErrorCode.GYM_EXERCISE_READONLY,
    });
    store.getOrThrow.mockResolvedValue(custom[1]);
    await expect(service.removeForGym('m1')).rejects.toMatchObject({ code: ErrorCode.GYM_EXERCISE_NOT_FOUND });
  });

  it('lets a member create and delete only their own exercise', async () => {
    const created = await service.createForMember({ name: ' Özel ', muscleGroup: 'legs', equipment: 'band' });
    expect(created).toMatchObject({ source: 'member', name: 'Özel', equipmentName: 'Direnç Bandı' });
    expect(store.create.mock.calls[0][1]).toMatchObject({ ownerUid: 'u1' });
    store.getOrThrow.mockResolvedValue(custom[2]);
    await expect(service.removeForMember('m2')).rejects.toMatchObject({ code: ErrorCode.GYM_EXERCISE_NOT_FOUND });
    store.getOrThrow.mockResolvedValue(custom[1]);
    await expect(service.removeForMember('m1')).resolves.toEqual({ id: 'm1' });
  });

  it('hides another member private exercise on direct read', async () => {
    store.getOrThrow.mockResolvedValue(custom[2]);
    await expect(service.get('m2')).rejects.toMatchObject({ code: ErrorCode.GYM_EXERCISE_NOT_FOUND });
    await expect(service.get('sys-ex-plank')).resolves.toMatchObject({ trackingType: 'duration' });
  });
});
