import { TENANT_COLLECTION } from '../../shared/firebase/firestore-path';
import { PermissionMap } from '../../shared/authorization/permissions';

export const DIET_COLLECTIONS = {
  clients: TENANT_COLLECTION.dietClients,
  measurements: TENANT_COLLECTION.dietMeasurements,
  consultations: TENANT_COLLECTION.dietConsultations,
  plans: TENANT_COLLECTION.dietPlans,
  conversations: TENANT_COLLECTION.dietConversations,
  messages: TENANT_COLLECTION.dietMessages,
  tasks: TENANT_COLLECTION.dietTasks,
  requests: TENANT_COLLECTION.dietRequests,
  devices: TENANT_COLLECTION.dietDevices,
  notificationPrefs: TENANT_COLLECTION.dietNotificationPrefs,
} as const;

export type DietCollection = (typeof DIET_COLLECTIONS)[keyof typeof DIET_COLLECTIONS];

const full = ['view', 'create', 'update', 'delete', 'export'] as const;
const write = ['view', 'create', 'update'] as const;

/**
 * Staff role templates matching the web app's RBAC (`staff-rbac.ts`). The clinic owner
 * ("Klinik Yöneticisi") is the tenant `owner` and bypasses permission checks.
 */
export const DIET_ROLE_TEMPLATES = [
  {
    key: 'diet-dietitian',
    label: 'Uzman Diyetisyen',
    permissions: {
      dietClients: [...full],
      dietClinical: [...full],
      dietSchedule: [...full],
      dietMessages: [...full],
      dietReports: ['view', 'export'],
    } satisfies PermissionMap,
  },
  {
    key: 'diet-assistant',
    label: 'Asistan / Stajyer Diyetisyen',
    permissions: {
      dietClients: ['view'],
      dietClinical: [...write],
      dietSchedule: [...write],
      dietMessages: [...write],
    } satisfies PermissionMap,
  },
  {
    key: 'diet-reception',
    label: 'Ön Büro / Klinik Sekreteri',
    permissions: {
      dietClients: [...write],
      dietSchedule: [...write],
      dietMessages: [...write],
    } satisfies PermissionMap,
  },
] as const;
