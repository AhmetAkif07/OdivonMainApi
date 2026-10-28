import { PermissionMap } from '../../shared/authorization/permissions';

export const FOOD_LABEL_COLLECTIONS = {
  records: 'foodLabelRecords',
  snapshots: 'foodLabelSnapshots',
  audit: 'foodLabelAuditLogs',
} as const;

const viewer: PermissionMap = { foodLabelRecords: ['view', 'export'] };
const editor: PermissionMap = { foodLabelRecords: ['view', 'create', 'update', 'export'] };

export const FOOD_LABEL_ROLE_TEMPLATES = [
  { key: 'food-label-viewer', label: 'Gıda Etiketi Görüntüleyici', permissions: viewer },
  { key: 'food-label-editor', label: 'Gıda Etiketi Uzmanı', permissions: editor },
  {
    key: 'food-label-manager',
    label: 'Gıda Etiketi Yöneticisi',
    permissions: {
      foodLabelRecords: ['view', 'create', 'update', 'delete', 'export', 'approve'],
    } satisfies PermissionMap,
  },
] as const;

export const FOOD_LABEL_AUDIT_EVENTS = {
  created: 'food-label.record.created',
  updated: 'food-label.record.updated',
  archived: 'food-label.record.archived',
  restored: 'food-label.record.restored',
  snapshot: 'food-label.snapshot.created',
} as const;

export const FOOD_LABEL_RECORD_KINDS = [
  'product',
  'recipe',
  'allergen-review',
  'nutrition',
  'approval',
] as const;
export const FOOD_LABEL_PLAN_LIMITS = {
  starter: { records: 100, users: 3, advancedReports: false },
  pro: { records: 1_500, users: 15, advancedReports: true },
  enterprise: { records: null, users: null, advancedReports: true },
} as const;
