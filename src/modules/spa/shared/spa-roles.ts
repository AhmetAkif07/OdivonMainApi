import { PermissionMap } from '../../../shared/authorization/permissions';

export const SPA_STAFF_ROLES = ['admin', 'reception', 'therapist'] as const;
export type SpaStaffRole = (typeof SPA_STAFF_ROLES)[number];

export const SPA_STAFF_ROLE_LABELS: Record<SpaStaffRole, string> = {
  admin: 'Yönetici',
  reception: 'Resepsiyon',
  therapist: 'Terapist',
};

/** Fixed ids so a staff member's `users/{uid}.roleIds` can point at the spa role without a lookup. */
export function spaRoleId(role: SpaStaffRole): string {
  return `spa-${role}`;
}

const ALL = ['view', 'create', 'update', 'delete'] as const;

/**
 * Default permission maps mirroring the old Firestore rules of the SPA app. Tenants may edit these
 * roles later from the roles screen; they are only created when missing.
 */
export const SPA_ROLE_PERMISSIONS: Record<SpaStaffRole, PermissionMap> = {
  admin: {
    spaCustomers: [...ALL],
    spaAppointments: [...ALL],
    spaCatalog: [...ALL],
    spaStock: [...ALL],
    spaStaff: [...ALL],
    spaLeaves: [...ALL],
    spaTasks: [...ALL],
    spaPackages: [...ALL],
    spaSessions: [...ALL],
    spaPayments: [...ALL],
    spaExpenses: [...ALL],
    spaCashRegister: [...ALL],
    spaCommissions: [...ALL],
    spaSettings: [...ALL],
    spaAudit: ['view'],
  },
  reception: {
    spaCustomers: ['view', 'create', 'update'],
    spaAppointments: ['view', 'create', 'update'],
    spaCatalog: ['view'],
    spaStock: ['view', 'create'],
    spaStaff: ['view'],
    spaLeaves: ['view', 'create'],
    spaTasks: ['view', 'create', 'update'],
    spaPackages: ['view', 'create', 'update'],
    spaSessions: ['view', 'create'],
    spaPayments: ['view', 'create', 'update'],
    spaCashRegister: ['view', 'create'],
    spaSettings: ['view'],
  },
  therapist: {
    spaCustomers: ['view'],
    spaAppointments: ['view'],
    spaCatalog: ['view'],
    spaStock: ['view'],
    spaStaff: ['view'],
    spaLeaves: ['view', 'create'],
    spaTasks: ['view', 'update'],
    spaPackages: ['view'],
    spaSessions: ['view', 'create'],
    spaPayments: ['view'],
    spaCashRegister: ['view'],
    spaSettings: ['view'],
  },
};

export function isSpaStaffRole(value: unknown): value is SpaStaffRole {
  return typeof value === 'string' && (SPA_STAFF_ROLES as readonly string[]).includes(value);
}
