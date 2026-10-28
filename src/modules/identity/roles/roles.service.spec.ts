import { RolesService } from './roles.service';
import { ErrorCode } from '../../../shared/errors/error-codes';

describe('RolesService', () => {
  const roles = {
    list: jest.fn(),
    findByIds: jest.fn(),
    getByIdOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  const users = {
    listByCurrentTenant: jest.fn(),
  };

  let service: RolesService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new RolesService(roles as never, users as never);
  });

  it('creates a role with a normalized permission matrix', async () => {
    roles.create.mockImplementation(async (fields) => ({ id: 'r1', ...fields }));

    await service.create({
      name: ' Sekreter ',
      permissions: { customers: ['create'], appointments: ['view', 'update'] },
    });

    expect(roles.create).toHaveBeenCalledWith({
      name: 'Sekreter',
      description: null,
      permissions: { customers: ['view', 'create'], appointments: ['view', 'update'] },
    });
  });

  it('rejects unknown resources', async () => {
    await expect(
      service.create({ name: 'X', permissions: { nope: ['view'] } }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });

  it('rejects unknown actions', async () => {
    await expect(
      service.create({ name: 'X', permissions: { customers: ['publish'] } }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });

  it('blocks deleting a role that is assigned to a user', async () => {
    roles.getByIdOrThrow.mockResolvedValue({ id: 'r1' });
    users.listByCurrentTenant.mockResolvedValue([{ uid: 'u1', roleIds: ['r1'] }]);

    await expect(service.softDelete('r1')).rejects.toMatchObject({ code: ErrorCode.ROLE_IN_USE });
    expect(roles.softDelete).not.toHaveBeenCalled();
  });

  it('deletes an unassigned role', async () => {
    roles.getByIdOrThrow.mockResolvedValue({ id: 'r1' });
    users.listByCurrentTenant.mockResolvedValue([{ uid: 'u1', roleIds: ['r2'] }]);

    await service.softDelete('r1');
    expect(roles.softDelete).toHaveBeenCalledWith('r1');
  });

  it('fails when an assigned role does not exist', async () => {
    roles.findByIds.mockResolvedValue([{ id: 'r1' }]);
    await expect(service.assertRolesExist(['r1', 'r2'])).rejects.toMatchObject({
      code: ErrorCode.ROLE_NOT_FOUND,
    });
  });
});
