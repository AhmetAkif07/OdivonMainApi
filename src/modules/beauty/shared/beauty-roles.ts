import { PermissionMap, PermissionResource } from '../../../shared/authorization/permissions';

export const BEAUTY_ROLES = ['owner', 'admin', 'manager', 'receptionist', 'specialist', 'cashier', 'customer', 'auditor'] as const;
export type BeautyRole = (typeof BEAUTY_ROLES)[number];
export type BeautyScope = 'all' | 'own' | 'limited';

const ALL = ['view', 'create', 'update', 'delete'] as const;
const VIEW = ['view'] as const;

export function beautyRoleId(role: BeautyRole): string {
  return `beauty-${role}`;
}

export const BEAUTY_ROLE_PERMISSIONS: Record<BeautyRole, PermissionMap> = {
  owner: {
    beautyDashboard: [...VIEW], beautyBranches: [...ALL], beautyCustomers: [...ALL], beautyHealth: [...ALL],
    beautyAppointments: [...ALL], beautySessions: [...ALL], beautyCatalog: [...ALL], beautyResources: [...ALL],
    beautyStaff: [...ALL], beautyFinance: [...ALL], beautyInventory: [...ALL], beautyCommissions: [...ALL],
    beautyCampaigns: [...ALL], beautyReports: [...VIEW], beautySettings: [...ALL], beautyAudit: [...VIEW],
  },
  admin: {
    beautyDashboard: [...VIEW], beautyBranches: [...ALL], beautyCustomers: [...ALL], beautyHealth: [...ALL],
    beautyAppointments: [...ALL], beautySessions: [...ALL], beautyCatalog: [...ALL], beautyResources: [...ALL],
    beautyStaff: [...ALL], beautyFinance: [...ALL], beautyInventory: [...ALL], beautyCommissions: [...ALL],
    beautyCampaigns: [...ALL], beautyReports: [...VIEW], beautySettings: [...ALL], beautyAudit: [...VIEW],
  },
  manager: {
    beautyDashboard: [...VIEW], beautyBranches: ['view', 'update'], beautyCustomers: [...ALL], beautyHealth: ['view', 'create', 'update'],
    beautyAppointments: [...ALL], beautySessions: [...ALL], beautyCatalog: ['view', 'create', 'update'], beautyResources: [...ALL],
    beautyStaff: ['view', 'create', 'update'], beautyFinance: ['view', 'create', 'update'], beautyInventory: [...ALL],
    beautyCommissions: [...VIEW], beautyCampaigns: ['view', 'create', 'update'], beautyReports: [...VIEW], beautySettings: [...VIEW], beautyAudit: [...VIEW],
  },
  receptionist: {
    beautyDashboard: [...VIEW], beautyBranches: [...VIEW], beautyCustomers: ['view', 'create', 'update'], beautyHealth: [...VIEW],
    beautyAppointments: ['view', 'create', 'update'], beautySessions: ['view', 'create'], beautyCatalog: [...VIEW], beautyResources: [...VIEW],
    beautyStaff: [...VIEW], beautyFinance: ['view', 'create', 'update'], beautyInventory: [...VIEW], beautyCampaigns: [...VIEW], beautyReports: [...VIEW], beautySettings: [...VIEW],
  },
  specialist: {
    beautyDashboard: [...VIEW], beautyBranches: [...VIEW], beautyCustomers: [...VIEW], beautyHealth: ['view', 'create', 'update'],
    beautyAppointments: ['view', 'update'], beautySessions: ['view', 'create', 'update'], beautyCatalog: [...VIEW], beautyResources: [...VIEW],
    beautyStaff: [...VIEW], beautyInventory: [...VIEW], beautyCommissions: [...VIEW], beautyReports: [...VIEW],
  },
  cashier: {
    beautyDashboard: [...VIEW], beautyBranches: [...VIEW], beautyCustomers: [...VIEW], beautyAppointments: [...VIEW],
    beautySessions: [...VIEW], beautyCatalog: [...VIEW], beautyStaff: [...VIEW], beautyFinance: ['view', 'create', 'update'],
    beautyCommissions: [...VIEW], beautyReports: [...VIEW], beautySettings: [...VIEW],
  },
  customer: {
    beautyCustomers: [...VIEW], beautyHealth: [...VIEW], beautyAppointments: ['view', 'create', 'update'],
    beautySessions: [...VIEW], beautyCatalog: [...VIEW], beautyCampaigns: [...VIEW],
  },
  auditor: {
    beautyDashboard: [...VIEW], beautyBranches: [...VIEW], beautyCustomers: [...VIEW], beautyHealth: [...VIEW],
    beautyAppointments: [...VIEW], beautySessions: [...VIEW], beautyCatalog: [...VIEW], beautyResources: [...VIEW],
    beautyStaff: [...VIEW], beautyFinance: [...VIEW], beautyInventory: [...VIEW], beautyCommissions: [...VIEW],
    beautyCampaigns: [...VIEW], beautyReports: [...VIEW], beautySettings: [...VIEW], beautyAudit: [...VIEW],
  },
};

export const BEAUTY_ROLE_SCOPES: Record<BeautyRole, Partial<Record<PermissionResource, BeautyScope>>> = {
  owner: {}, admin: {}, manager: {}, receptionist: { beautyReports: 'limited' }, cashier: { beautyReports: 'limited' }, auditor: {},
  specialist: { beautyDashboard: 'own', beautyAppointments: 'own', beautySessions: 'own', beautyStaff: 'own', beautyCommissions: 'own', beautyReports: 'own' },
  customer: { beautyCustomers: 'own', beautyHealth: 'own', beautyAppointments: 'own', beautySessions: 'own' },
};

export function isBeautyRole(value: unknown): value is BeautyRole {
  return typeof value === 'string' && (BEAUTY_ROLES as readonly string[]).includes(value);
}
