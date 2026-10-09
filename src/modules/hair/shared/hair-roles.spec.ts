import {
  normalizePermissionMap,
  resourcesForModules,
} from '../../../shared/authorization/permissions';
import { HAIR_ROLE_PERMISSIONS, HAIR_STAFF_ROLES, scopeFor } from './hair-roles';

describe('hair default roles', () => {
  it.each(HAIR_STAFF_ROLES)('%s only grants known hair resources', (role) => {
    const map = HAIR_ROLE_PERMISSIONS[role];
    expect(normalizePermissionMap(map)).toEqual(map);
    const keys = new Set(resourcesForModules(['hair']).map((resource) => resource.key));
    expect(Object.keys(map).every((key) => keys.has(key as never))).toBe(true);
  });

  it('keeps sensitive areas away from lower roles', () => {
    expect(HAIR_ROLE_PERMISSIONS.stylist.hairExpenses).toBeUndefined();
    expect(HAIR_ROLE_PERMISSIONS.cashier.hairFormulas).toBeUndefined();
    expect(HAIR_ROLE_PERMISSIONS.receptionist.hairCommissions).toBeUndefined();
    expect(HAIR_ROLE_PERMISSIONS.receptionist.hairAudit).toBeUndefined();
    expect(HAIR_ROLE_PERMISSIONS.manager.hairCommissions).toEqual(['view']);
  });

  it('scopes stylists to their own rows', () => {
    expect(scopeFor('stylist', 'hairAppointments')).toBe('own');
    expect(scopeFor('stylist', 'hairCommissions')).toBe('own');
    expect(scopeFor('cashier', 'hairReports')).toBe('limited');
    expect(scopeFor('admin', 'hairAppointments')).toBe('all');
  });
});
