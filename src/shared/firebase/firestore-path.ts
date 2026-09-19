export const TENANT_COLLECTION = {
  customers: 'customers',
  patients: 'patients',
  appointments: 'appointments',
  examinations: 'examinations',
  auditLogs: 'auditLogs',
  appointmentReservations: 'appointmentReservations',
} as const;

export const ROOT_COLLECTION = {
  users: 'users',
  tenants: 'tenants',
} as const;

export function tenantCollectionPath(tenantId: string, collection: string): string {
  if (!tenantId) {
    throw new Error('tenantId is required for tenant collection path');
  }
  return `tenants/${tenantId}/${collection}`;
}
