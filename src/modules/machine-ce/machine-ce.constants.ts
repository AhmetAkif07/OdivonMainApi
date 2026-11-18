import { PermissionMap } from '../../shared/authorization/permissions';

export const MACHINE_CE_COLLECTIONS = {
  records: 'machineCeRecords',
  snapshots: 'machineCeSnapshots',
  audit: 'machineCeAuditLogs',
} as const;

const viewer: PermissionMap = { machineCeRecords: ['view', 'export'] };
const editor: PermissionMap = { machineCeRecords: ['view', 'create', 'update', 'export'] };

export const MACHINE_CE_ROLE_TEMPLATES = [
  { key: 'machine-ce-viewer', label: 'Makine CE Denetçi (Salt Okunur)', permissions: viewer },
  { key: 'machine-ce-engineer', label: 'Risk & Teknik Dosya Mühendisi', permissions: editor },
  {
    key: 'machine-ce-manager',
    label: 'CE Baş Mühendisi & Onay Yöneticisi',
    permissions: {
      machineCeRecords: ['view', 'create', 'update', 'delete', 'export', 'approve'],
    } satisfies PermissionMap,
  },
] as const;

export const MACHINE_CE_AUDIT_EVENTS = {
  created: 'machine-ce.record.created',
  updated: 'machine-ce.record.updated',
  archived: 'machine-ce.record.archived',
  restored: 'machine-ce.record.restored',
  snapshot: 'machine-ce.snapshot.created',
} as const;

export const MACHINE_CE_RECORD_KINDS = [
  'machine',
  'risk-assessment',
  'standard',
  'technical-file',
  'declaration',
] as const;

export const MACHINE_CE_PLAN_LIMITS = {
  starter: { records: 100, users: 3, advancedReports: false },
  pro: { records: 1_500, users: 15, advancedReports: true },
  enterprise: { records: null, users: null, advancedReports: true },
} as const;
