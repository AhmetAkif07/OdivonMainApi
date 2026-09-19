export interface BaseDocument {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  deletedAt: string | null;
}

export function createBaseFields(id: string, userId: string, now = new Date().toISOString()) {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId,
    deletedAt: null as string | null,
  };
}

export function touchBaseFields(userId: string, now = new Date().toISOString()) {
  return {
    updatedAt: now,
    updatedBy: userId,
  };
}

export function isDeleted(doc: { deletedAt?: string | null } | undefined): boolean {
  return Boolean(doc?.deletedAt);
}

export function omitUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}
