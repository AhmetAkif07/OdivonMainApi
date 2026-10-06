import { PermissionMap, PermissionResource } from '../../../shared/authorization/permissions';

export const HAIR_STAFF_ROLES = ['admin', 'manager', 'receptionist', 'stylist', 'cashier'] as const;
export type HairStaffRole = (typeof HAIR_STAFF_ROLES)[number];

export const HAIR_STAFF_ROLE_LABELS: Record<HairStaffRole, string> = {
  admin: 'Yönetici',
  manager: 'Müdür',
  receptionist: 'Resepsiyon',
  stylist: 'Stilist',
  cashier: 'Kasiyer',
};

/** Fixed ids so a staff member's `users/{uid}.roleIds` can point at the hair role without a lookup. */
export function hairRoleId(role: HairStaffRole): string {
  return `hair-${role}`;
}

const ALL = ['view', 'create', 'update', 'delete'] as const;

/** Default permission maps (plan §6.2). Created per tenant only when missing. */
export const HAIR_ROLE_PERMISSIONS: Record<HairStaffRole, PermissionMap> = {
  admin: {
    hairCustomers: [...ALL],
    hairAppointments: [...ALL],
    hairCatalog: [...ALL],
    hairStock: [...ALL],
    hairStaff: [...ALL],
    hairLeaves: [...ALL],
    hairPackages: [...ALL],
    hairSessions: [...ALL],
    hairPayments: [...ALL],
    hairExpenses: [...ALL],
    hairCashRegister: [...ALL],
    hairCommissions: [...ALL],
    hairFormulas: [...ALL],
    hairSettings: [...ALL],
    hairBranches: [...ALL],
    hairDashboard: ['view'],
    hairReports: ['view'],
    hairAudit: ['view'],
  },
  manager: {
    hairCustomers: [...ALL],
    hairAppointments: [...ALL],
    hairCatalog: ['view', 'create', 'update'],
    hairStock: [...ALL],
    hairStaff: ['view', 'create', 'update'],
    hairLeaves: ['view', 'create', 'update'],
    hairPackages: ['view', 'create', 'update'],
    hairSessions: ['view', 'create', 'update'],
    hairPayments: ['view', 'create', 'update'],
    hairExpenses: ['view', 'create', 'update'],
    hairCashRegister: ['view', 'create', 'update'],
    hairCommissions: ['view'],
    hairFormulas: ['view', 'create', 'update'],
    hairSettings: ['view'],
    hairBranches: ['view', 'update'],
    hairDashboard: ['view'],
    hairReports: ['view'],
    hairAudit: ['view'],
  },
  receptionist: {
    hairCustomers: ['view', 'create', 'update'],
    hairAppointments: ['view', 'create', 'update'],
    hairCatalog: ['view'],
    hairStock: ['view', 'create', 'update'],
    hairStaff: ['view'],
    hairLeaves: ['view', 'create'],
    hairPackages: ['view', 'create', 'update'],
    hairSessions: ['view', 'create'],
    hairPayments: ['view', 'create', 'update'],
    hairExpenses: ['view', 'create'],
    hairCashRegister: ['view', 'create'],
    hairFormulas: ['view'],
    hairSettings: ['view'],
    hairBranches: ['view'],
    hairDashboard: ['view'],
    hairReports: ['view'],
  },
  stylist: {
    hairCustomers: ['view'],
    hairAppointments: ['view'],
    hairCatalog: ['view'],
    hairStock: ['view'],
    hairStaff: ['view'],
    hairLeaves: ['view', 'create'],
    hairPackages: ['view'],
    hairSessions: ['view', 'create'],
    hairPayments: ['view'],
    hairFormulas: ['view', 'create', 'update'],
    hairSettings: ['view'],
    hairBranches: ['view'],
    hairDashboard: ['view'],
    hairReports: ['view'],
    hairCommissions: ['view'],
    hairCashRegister: ['view'],
  },
  cashier: {
    hairCustomers: ['view'],
    hairAppointments: ['view'],
    hairCatalog: ['view'],
    hairStock: ['view'],
    hairStaff: ['view'],
    hairLeaves: ['view', 'create'],
    hairPackages: ['view'],
    hairSessions: ['view', 'create'],
    hairPayments: ['view', 'create', 'update'],
    hairExpenses: ['view', 'create'],
    hairCashRegister: ['view', 'create'],
    hairSettings: ['view'],
    hairBranches: ['view'],
    hairDashboard: ['view'],
    hairReports: ['view'],
    hairCommissions: ['view'],
  },
};

/**
 * How far a role's `view` reaches (plan §6.2b). `own` limits rows to the caller's staff id;
 * `limited` strips cost/total fields from the response. A missing key means `all`.
 */
export type HairScope = 'all' | 'own' | 'limited';

export const HAIR_ROLE_SCOPES: Record<HairStaffRole, Partial<Record<PermissionResource, HairScope>>> = {
  admin: {},
  manager: {},
  receptionist: { hairReports: 'limited' },
  stylist: {
    hairAppointments: 'own',
    hairStaff: 'own',
    hairLeaves: 'own',
    hairCommissions: 'own',
    hairReports: 'own',
    hairDashboard: 'own',
  },
  cashier: { hairLeaves: 'own', hairReports: 'limited' },
};

export function scopeFor(role: HairStaffRole, resource: PermissionResource): HairScope {
  return HAIR_ROLE_SCOPES[role][resource] ?? 'all';
}

export function isHairStaffRole(value: unknown): value is HairStaffRole {
  return typeof value === 'string' && (HAIR_STAFF_ROLES as readonly string[]).includes(value);
}
