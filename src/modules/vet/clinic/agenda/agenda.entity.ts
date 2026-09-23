import { BaseDocument } from '../../../../shared/firestore/base-document';

export const AGENDA_TYPES = ['task', 'call', 'visit', 'other'] as const;
export type AgendaType = (typeof AGENDA_TYPES)[number];

export const AGENDA_PRIORITIES = ['low', 'normal', 'high'] as const;
export type AgendaPriority = (typeof AGENDA_PRIORITIES)[number];

export interface AgendaItem extends BaseDocument {
  title: string;
  type: AgendaType;
  priority: AgendaPriority;
  dueAt: string;
  notes: string | null;
  done: boolean;
}
