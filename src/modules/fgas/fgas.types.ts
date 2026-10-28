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
  entity: 'fgasRecord' | 'fgasOperation';
  entityId: string;
  version: number;
  actorId: string;
  createdAt: string;
}

export type FgasOperationKind = 'leak-check' | 'gas-movement' | 'technician' | 'inspection';
export interface FgasOperation {
  id: string;
  tenantId: string;
  kind: FgasOperationKind;
  title: string;
  reference: string | null;
  equipmentId: string | null;
  location: string | null;
  occurredAt: string | null;
  dueAt: string | null;
  status: 'draft' | 'scheduled' | 'completed' | 'action-required' | 'expired';
  technicianId: string | null;
  technicianName: string | null;
  certificateNumber: string | null;
  certificateCategory: string | null;
  certificateExpiresAt: string | null;
  refrigerant: string | null;
  quantityKg: number | null;
  movementType: 'charge' | 'recovery' | 'transfer' | 'disposal' | null;
  result: 'pass' | 'conditional' | 'fail' | null;
  leakDetected: boolean | null;
  repairRequired: boolean | null;
  followUpDueAt: string | null;
  notes: string | null;
  evidenceRefs: string[];
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  archivedAt: string | null;
  archivedBy: string | null;
}
