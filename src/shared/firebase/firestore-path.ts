export const TENANT_COLLECTION = {
  customers: 'customers',
  patients: 'patients',
  appointments: 'appointments',
  examinations: 'examinations',
  auditLogs: 'auditLogs',
  appointmentReservations: 'appointmentReservations',
  productCategories: 'productCategories',
  units: 'units',
  taxes: 'taxes',
  stores: 'stores',
  suppliers: 'suppliers',
  paymentMethods: 'paymentMethods',
  appointmentTypes: 'appointmentTypes',
  customerGroups: 'customerGroups',
  cashRegisters: 'cashRegisters',
  products: 'products',
  vaccines: 'vaccines',
  vaccineSchedules: 'vaccineSchedules',
  sales: 'sales',
  collections: 'collections',
  cashMovements: 'cashMovements',
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
