export interface FgasRecord {
  id: string;
  tenantId: string;
  name: string;
  location: string;
  equipmentCode: string | null;
  equipmentType:
    | 'stationary-refrigeration'
    | 'air-conditioning'
    | 'heat-pump'
    | 'transport-refrigeration'
    | 'fire-protection'
    | 'switchgear'
    | 'other';
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  refrigerant: string | null;
  refrigerantChargeKg: number | null;
  co2EquivalentTonnes: number | null;
  hermeticallySealed: boolean;
  leakDetectionSystem: boolean;
  installationDate: string | null;
  lastLeakCheckAt: string | null;
  nextLeakCheckDueAt: string | null;
  responsiblePerson: string | null;
  inspectionIntervalMonths: 3 | 6 | 12 | 24 | null;
  notes: string | null;
  status: 'active' | 'action-required' | 'out-of-service';
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  archivedAt: string | null;
  archivedBy: string | null;
}

export interface FgasAuditEntry {
  id: string;
  event: string;
  entity: 'fgasRecord';
  entityId: string;
  version: number;
  actorId: string;
  createdAt: string;
}
