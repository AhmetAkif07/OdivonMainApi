import { staffAccess } from './gym-default-roles';

describe('staffAccess', () => {
  it('gives trainers and receptionists the default gym role as plain users', () => {
    expect(staffAccess('trainer')).toEqual({ role: 'user', roleIds: ['gym-trainer'] });
    expect(staffAccess('receptionist')).toEqual({ role: 'user', roleIds: ['gym-reception'] });
    expect(staffAccess(undefined)).toEqual({ role: 'user', roleIds: ['gym-trainer'] });
  });

  it('keeps admins admin with the manager role, owners without a gym role', () => {
    expect(staffAccess('admin')).toEqual({ role: 'admin', roleIds: ['gym-manager'] });
    expect(staffAccess('owner')).toEqual({ role: 'owner', roleIds: [] });
  });

  it('swaps only the default gym role and keeps roles the gym assigned by hand', () => {
    expect(staffAccess('receptionist', ['gym-trainer', 'custom-1'])).toEqual({ role: 'user', roleIds: ['custom-1', 'gym-reception'] });
  });
});
