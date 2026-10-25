import { PermissionMap } from '../../shared/authorization/permissions';

export const FGAS_COLLECTIONS = {
  records: 'fgasRecords',
  operations: 'fgasOperations',
  snapshots: 'fgasSnapshots',
  audit: 'fgasAuditLogs',
} as const;

const viewer: PermissionMap = { fgasRecords: ['view', 'export'] };
const editor: PermissionMap = { fgasRecords: ['view', 'create', 'update', 'export'] };

export const FGAS_ROLE_TEMPLATES = [
  { key: 'fgas-viewer', label: 'F-Gas Görüntüleyici', permissions: viewer },
  { key: 'fgas-technician', label: 'F-Gas Teknisyeni', permissions: editor },
  {
    key: 'fgas-manager',
    label: 'F-Gas Yöneticisi',
    permissions: {
      fgasRecords: ['view', 'create', 'update', 'delete', 'export', 'approve'],
    } satisfies PermissionMap,
  },
] as const;

export const FGAS_AUDIT_EVENTS = {
  created: 'fgas.record.created',
  updated: 'fgas.record.updated',
  archived: 'fgas.record.archived',
  restored: 'fgas.record.restored',
  snapshot: 'fgas.snapshot.created',
  operationCreated: 'fgas.operation.created',
  operationUpdated: 'fgas.operation.updated',
  operationArchived: 'fgas.operation.archived',
  operationRestored: 'fgas.operation.restored',
} as const;
