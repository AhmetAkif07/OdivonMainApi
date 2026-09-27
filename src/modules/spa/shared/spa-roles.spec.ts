import {
  normalizePermissionMap,
  resourcesForModules,
} from '../../../shared/authorization/permissions';
import { SPA_ROLE_PERMISSIONS, SPA_STAFF_ROLES } from './spa-roles';

describe('spa default roles', () => {
  it.each(SPA_STAFF_ROLES)('%s only grants known spa resources', (role) => {
    const map = SPA_ROLE_PERMISSIONS[role];
    expect(normalizePermissionMap(map)).toEqual(map);
    const spaKeys = new Set(resourcesForModules(['spa']).map((resource) => resource.key));
    expect(Object.keys(map).every((key) => spaKeys.has(key as never))).toBe(true);
  });

  it('keeps finance administration with admins only', () => {
    expect(SPA_ROLE_PERMISSIONS.reception.spaExpenses).toBeUndefined();
    expect(SPA_ROLE_PERMISSIONS.therapist.spaCommissions).toBeUndefined();
    expect(SPA_ROLE_PERMISSIONS.reception.spaCashRegister).not.toContain('update');
  });
});
