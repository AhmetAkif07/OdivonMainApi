import { DocumentSnapshot } from 'firebase-admin/firestore';
import { isDeleted } from '../../../shared/firestore/base-document';
import { HairDoc } from './hair-store';

/** Snapshot data with its id, or null when missing or soft-deleted. */
export function live<T extends HairDoc = HairDoc>(snapshot: DocumentSnapshot): T | null {
  const data = snapshot.exists ? ({ ...(snapshot.data() as T), id: snapshot.id } as T) : null;
  return data && !isDeleted(data) ? data : null;
}

export function toMap<T extends HairDoc = HairDoc>(snapshots: DocumentSnapshot[]): Map<string, T> {
  return new Map(
    snapshots.flatMap((snapshot) => {
      const data = live<T>(snapshot);
      return data ? [[snapshot.id, data] as const] : [];
    }),
  );
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function fullName(doc: HairDoc | null | undefined): string {
  if (!doc) return '';
  return `${str(doc['firstName'])} ${str(doc['lastName'])}`.trim();
}

/** Case-insensitive Turkish-aware "contains" over the given fields. */
export function matchesSearch(doc: HairDoc, term: string | undefined, fields: string[]): boolean {
  if (!term) return true;
  return fields.some((field) =>
    str(doc[field]).toLocaleLowerCase('tr').includes(term),
  );
}
