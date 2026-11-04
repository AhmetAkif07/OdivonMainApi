import { BaseDocument } from '../../../../shared/firestore/base-document';

export const AGENDA_TYPES = ['task', 'call', 'visit', 'other'] as const;
export type AgendaType = (typeof AGENDA_TYPES)[number];

export const AGENDA_PRIORITIES = ['low', 'normal', 'high'] as const;
export type AgendaPriority = (typeof AGENDA_PRIORITIES)[number];

export const AGENDA_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type AgendaFrequency = (typeof AGENDA_FREQUENCIES)[number];

/** Which items an edit or delete of a repeating task applies to. */
export const AGENDA_SCOPES = ['single', 'following', 'series'] as const;
export type AgendaScope = (typeof AGENDA_SCOPES)[number];

export interface AgendaRecurrence {
  frequency: AgendaFrequency;
  /** Every N days/weeks/months/years. */
  interval: number;
  /** Weekly only: 0 = Sunday … 6 = Saturday. Empty = the start's weekday. */
  weekdays?: number[];
  /** Last day, YYYY-MM-DD. */
  until?: string | null;
  /** Number of occurrences. */
  count?: number | null;
  /** Clinic's offset from UTC in minutes (Türkiye = 180); weekdays and month days use it. */
  utcOffsetMinutes?: number;
  /** First occurrence of the series; occurrence dates are computed from it. */
  startAt?: string;
}

export interface AgendaItem extends BaseDocument {
  title: string;
  type: AgendaType;
  priority: AgendaPriority;
  dueAt: string;
  notes: string | null;
  done: boolean;
  /** Repeating tasks: every occurrence is its own item sharing `seriesId` (the first item's id). */
  seriesId?: string | null;
  occurrenceIndex?: number | null;
  recurrence?: AgendaRecurrence | null;
}
