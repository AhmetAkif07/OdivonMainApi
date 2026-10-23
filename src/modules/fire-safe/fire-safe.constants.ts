import { PermissionMap } from '../../shared/authorization/permissions';

export const FIRE_SAFE_COLLECTIONS = {
  records: 'fireSafeRecords',
  snapshots: 'fireSafeSnapshots',
  audit: 'fireSafeAuditLogs',
} as const;

const viewer: PermissionMap = { fireSafeRecords: ['view', 'export'] };
const editor: PermissionMap = { fireSafeRecords: ['view', 'create', 'update', 'export'] };

export const FIRE_SAFE_ROLE_TEMPLATES = [
  { key: 'fire-safe-viewer', label: 'Yangın Güvenliği Görüntüleyici', permissions: viewer },
  { key: 'fire-safe-inspector', label: 'Yangın Güvenliği Denetçisi', permissions: editor },
  { key: 'fire-safe-manager', label: 'Yangın Güvenliği Yöneticisi', permissions: { fireSafeRecords: ['view', 'create', 'update', 'delete', 'export', 'approve'] } satisfies PermissionMap },
] as const;

export const FIRE_SAFE_AUDIT_EVENTS = {
  created: 'fire-safe.record.created', updated: 'fire-safe.record.updated', archived: 'fire-safe.record.archived', restored: 'fire-safe.record.restored', snapshot: 'fire-safe.snapshot.created',
} as const;
