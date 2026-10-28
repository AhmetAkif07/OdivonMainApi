import { PermissionMap } from '../../shared/authorization/permissions';

export const PARKING_ROLE_TEMPLATES: ReadonlyArray<{ id: string; label: string; permissions: PermissionMap }> = [
  { id: 'parking-admin', label: 'Otopark Yöneticisi', permissions: full(['parkingDashboard', 'parkingFacilities', 'parkingSessions', 'parkingTariffs', 'parkingPayments', 'parkingCash', 'parkingDevices', 'parkingAudit']) },
  { id: 'parking-supervisor', label: 'Süpervizör', permissions: full(['parkingDashboard', 'parkingSessions', 'parkingTariffs', 'parkingPayments', 'parkingCash', 'parkingDevices', 'parkingAudit']) },
  { id: 'parking-operator', label: 'Operatör', permissions: actions({ parkingDashboard: ['view'], parkingSessions: ['view', 'create', 'update'], parkingFacilities: ['view'], parkingDevices: ['view', 'approve'] }) },
  { id: 'parking-cashier', label: 'Kasiyer', permissions: actions({ parkingDashboard: ['view'], parkingSessions: ['view', 'update'], parkingPayments: ['view', 'create', 'refund'], parkingCash: ['view', 'create', 'update'] }) },
  { id: 'parking-security', label: 'Güvenlik', permissions: actions({ parkingDashboard: ['view'], parkingSessions: ['view'], parkingDevices: ['view', 'approve'], parkingAudit: ['view'] }) },
];

function full(keys: string[]): PermissionMap { return Object.fromEntries(keys.map((key) => [key, ['view', 'create', 'update', 'delete', 'approve', 'refund', 'export']])) as PermissionMap; }
function actions(value: Record<string, string[]>): PermissionMap { return value as PermissionMap; }

