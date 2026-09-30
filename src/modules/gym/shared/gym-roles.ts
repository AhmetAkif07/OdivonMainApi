import { PermissionMap } from '../../../shared/authorization/permissions';

/**
 * Default gym staff roles. Owners get everything through `role: 'owner'`; an `admin` user still
 * needs a role for gym permissions, so `manager` is the one to give them. Members never get a role:
 * the tenant guard strips permissions from `accountType: 'gym_member'` profiles.
 */
export const GYM_STAFF_ROLES = ['manager', 'reception', 'trainer'] as const;
export type GymStaffRoleKey = (typeof GYM_STAFF_ROLES)[number];

export const GYM_STAFF_ROLE_LABELS: Record<GymStaffRoleKey, string> = {
  manager: 'Yönetici',
  reception: 'Resepsiyon',
  trainer: 'Antrenör',
};

/** Fixed ids so a staff member's `users/{uid}.roleIds` can point at the gym role without a lookup. */
export function gymRoleId(role: GymStaffRoleKey): string {
  return `gym-${role}`;
}

const ALL = ['view', 'create', 'update', 'delete'] as const;

/** Tenants may edit these roles later from the roles screen; they are only created when missing. */
export const GYM_ROLE_PERMISSIONS: Record<GymStaffRoleKey, PermissionMap> = {
  manager: {
    members: [...ALL],
    packages: [...ALL],
    branches: [...ALL],
    staff: [...ALL],
    gymInfo: [...ALL],
    classes: [...ALL],
    gymAppointments: [...ALL],
    workouts: [...ALL],
    measurements: [...ALL],
    water: [...ALL],
    wallet: [...ALL],
    receivables: [...ALL],
    shop: [...ALL],
    accounting: [...ALL],
    accessControl: [...ALL],
    campaigns: [...ALL],
    guestMembers: [...ALL],
    disciplines: [...ALL],
    gymSuppliers: [...ALL],
    memberDocuments: [...ALL],
    sms: [...ALL],
    eInvoice: [...ALL],
    saas: ['view'],
    users: ['view'],
  },
  reception: {
    members: ['view', 'create', 'update'],
    packages: ['view'],
    branches: ['view'],
    staff: ['view'],
    gymInfo: ['view'],
    classes: ['view', 'create', 'update'],
    gymAppointments: ['view', 'create', 'update'],
    workouts: ['view'],
    measurements: ['view', 'create'],
    wallet: ['view', 'create'],
    receivables: ['view', 'create'],
    shop: ['view', 'create'],
    accessControl: ['view', 'create'],
    campaigns: ['view'],
    guestMembers: ['view', 'create', 'update'],
    disciplines: ['view'],
    memberDocuments: ['view', 'create', 'update'],
    saas: ['view'],
  },
  trainer: {
    members: ['view'],
    packages: ['view'],
    branches: ['view'],
    staff: ['view'],
    gymInfo: ['view'],
    classes: ['view', 'update'],
    gymAppointments: ['view', 'create', 'update'],
    workouts: [...ALL],
    measurements: ['view', 'create', 'update'],
    water: ['view'],
    guestMembers: ['view'],
    disciplines: ['view'],
    memberDocuments: ['view'],
    saas: ['view'],
  },
};
