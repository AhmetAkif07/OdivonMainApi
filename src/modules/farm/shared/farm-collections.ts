import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';

/**
 * Client collection name (OdivonFARM's `farms/{farmId}/{name}`) → tenant collection
 * (`tenants/{tenantId}/farm*`). Only these can be reached through the generic data endpoints.
 */
export const FARM_DATA_COLLECTIONS = {
  accountingItems: TENANT_COLLECTION.farmAccountingItems,
  accountingTransactions: TENANT_COLLECTION.farmAccountingTransactions,
  accounts: TENANT_COLLECTION.farmAccounts,
  activityLog: TENANT_COLLECTION.farmActivityLog,
  animalMovements: TENANT_COLLECTION.farmAnimalMovements,
  animalTypes: TENANT_COLLECTION.farmAnimalTypes,
  animals: TENANT_COLLECTION.farmAnimals,
  breeds: TENANT_COLLECTION.farmBreeds,
  counts: TENANT_COLLECTION.farmCounts,
  deathReasons: TENANT_COLLECTION.farmDeathReasons,
  diseases: TENANT_COLLECTION.farmDiseases,
  herds: TENANT_COLLECTION.farmHerds,
  insuredAnimals: TENANT_COLLECTION.farmInsuredAnimals,
  kurbanAnimals: TENANT_COLLECTION.farmKurbanAnimals,
  matings: TENANT_COLLECTION.farmMatings,
  members: TENANT_COLLECTION.farmMembers,
  paddocks: TENANT_COLLECTION.farmPaddocks,
  photos: TENANT_COLLECTION.farmPhotos,
  protocols: TENANT_COLLECTION.farmProtocols,
  rations: TENANT_COLLECTION.farmRations,
  references: TENANT_COLLECTION.farmReferences,
  roles: TENANT_COLLECTION.farmRoles,
  stockCategories: TENANT_COLLECTION.farmStockCategories,
  stockItems: TENANT_COLLECTION.farmStockItems,
  stockMovements: TENANT_COLLECTION.farmStockMovements,
  tags: TENANT_COLLECTION.farmTags,
  tasks: TENANT_COLLECTION.farmTasks,
  treatmentTypes: TENANT_COLLECTION.farmTreatmentTypes,
  treatments: TENANT_COLLECTION.farmTreatments,
  warehouses: TENANT_COLLECTION.farmWarehouses,
  weightRecords: TENANT_COLLECTION.farmWeightRecords,
  yields: TENANT_COLLECTION.farmYields,
} as const;

export type FarmDataCollection = keyof typeof FARM_DATA_COLLECTIONS;

/** Collections with their own endpoints (and rules); the generic endpoints only read them. */
export const READ_ONLY_DATA_COLLECTIONS: ReadonlySet<FarmDataCollection> = new Set(['members']);

/**
 * Activity entries are an audit feed: the old rules let every member (read-only ones too) add them.
 */
export const OPEN_CREATE_COLLECTIONS: ReadonlySet<FarmDataCollection> = new Set(['activityLog']);

export function isFarmDataCollection(value: string): value is FarmDataCollection {
  return Object.prototype.hasOwnProperty.call(FARM_DATA_COLLECTIONS, value);
}

/** Fields the server owns; client bodies can never set them. */
export const PROTECTED_FIELDS = new Set([
  'id',
  'farmId',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
  'deletedAt',
  'deletedBy',
]);
