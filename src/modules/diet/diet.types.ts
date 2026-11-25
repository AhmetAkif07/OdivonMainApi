/**
 * OdivonDiet data model. Mirrors the web app's domain (`OdivonDiet/src/app/domain/*.models.ts`) so the
 * Angular panel and the mobile app read the same records. Every document lives under
 * `tenants/{tenantId}/diet*` and carries the shared base fields (soft delete via `deletedAt`).
 */
import { BaseDocument } from '../../shared/firestore/base-document';

export const DIET_SEXES = ['female', 'male'] as const;
export const DIET_ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
export const DIET_PROGRAMS = ['weight_loss', 'weight_gain', 'sports', 'clinical', 'healthy'] as const;
export const DIET_CLIENT_STATUSES = ['active', 'paused', 'archived'] as const;
export const DIET_PLAN_STATUSES = ['draft', 'active', 'completed'] as const;
export const DIET_CHANNELS = ['clinic', 'video', 'phone', 'message'] as const;
export const DIET_CONSULTATION_STATUSES = ['scheduled', 'done', 'cancelled'] as const;
export const DIET_TASK_CATEGORIES = ['meal_log', 'measurement', 'water', 'exercise', 'photo', 'other'] as const;
export const DIET_TASK_STATUSES = ['open', 'done'] as const;
export const DIET_REQUEST_TYPES = ['appointment', 'plan_change', 'question', 'document', 'other'] as const;
export const DIET_REQUEST_STATUSES = ['open', 'in_progress', 'resolved', 'rejected'] as const;
export const DIET_DEVICE_PLATFORMS = ['ios', 'android', 'web'] as const;

export type DietSex = (typeof DIET_SEXES)[number];
export type DietActivityLevel = (typeof DIET_ACTIVITY_LEVELS)[number];
export type DietProgram = (typeof DIET_PROGRAMS)[number];
export type DietClientStatus = (typeof DIET_CLIENT_STATUSES)[number];
export type DietPlanStatus = (typeof DIET_PLAN_STATUSES)[number];
export type DietChannel = (typeof DIET_CHANNELS)[number];
export type DietConsultationStatus = (typeof DIET_CONSULTATION_STATUSES)[number];
export type DietTaskCategory = (typeof DIET_TASK_CATEGORIES)[number];
export type DietTaskStatus = (typeof DIET_TASK_STATUSES)[number];
export type DietRequestType = (typeof DIET_REQUEST_TYPES)[number];
export type DietRequestStatus = (typeof DIET_REQUEST_STATUSES)[number];
export type DietDevicePlatform = (typeof DIET_DEVICE_PLATFORMS)[number];

export interface DietAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: 'image' | 'file';
  url: string;
}

/** Fields only users with `dietClinical:view` may read (health data, KVKK special category). */
export const DIET_CLIENT_CLINICAL_FIELDS = [
  'conditions',
  'allergies',
  'clinicalNotes',
  'bodyFatPct',
  'waistCm',
  'hipCm',
] as const;

export interface DietClient extends BaseDocument {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string | null;
  sex: DietSex;
  heightCm: number;
  startWeightKg: number;
  targetWeightKg: number;
  /** Latest measured weight; kept in sync when measurements are added. */
  currentWeightKg: number;
  lastMeasuredAt: string | null;
  activity: DietActivityLevel;
  program: DietProgram;
  conditions: string[];
  allergies: string[];
  consentAt: string | null;
  status: DietClientStatus;
  /** Staff member who follows this client (defaults to the creator). */
  dietitianId: string;
  waistCm: number | null;
  hipCm: number | null;
  bodyFatPct: number | null;
  waterTargetL: number | null;
  clinicalNotes: string;
  /** Member portal account (set when the dietitian invites the client). */
  portal?: DietClientPortal | null;
}

export const DIET_PORTAL_STATUSES = ['invited', 'active', 'disabled'] as const;
export type DietPortalStatus = (typeof DIET_PORTAL_STATUSES)[number];

export interface DietClientPortal {
  status: DietPortalStatus;
  /** Firebase Auth uid of the member account. */
  uid: string;
  email: string;
  invitedAt: string;
  activatedAt: string | null;
  disabledAt: string | null;
}

export interface DietMeasurement extends BaseDocument {
  clientId: string;
  date: string;
  weightKg: number;
  waistCm: number | null;
  hipCm: number | null;
  bodyFatPct: number | null;
  muscleMassKg: number | null;
  visceralFatRating: number | null;
  bodyWaterPct: number | null;
  metabolicAge: number | null;
  note: string;
  source: 'dietitian' | 'member';
}

export interface DietMeal {
  name: string;
  time: string;
  kcal: number;
  proteinG?: number;
  carbG?: number;
  fatG?: number;
  fiberG?: number;
  items?: Record<string, unknown>[];
  note?: string;
}

export interface DietPlan extends BaseDocument {
  clientId: string;
  title: string;
  startDate: string;
  endDate: string;
  kcal: number;
  proteinPct: number;
  carbPct: number;
  fatPct: number;
  meals: DietMeal[];
  status: DietPlanStatus;
  notes: string;
}

export interface DietConsultation extends BaseDocument {
  clientId: string;
  dietitianId: string;
  at: string;
  durationMin: number;
  channel: DietChannel;
  status: DietConsultationStatus;
  adherence: number | null;
  notes: string;
  nextAction: string;
}

/** One conversation per client; document id = client id. */
export interface DietConversation extends BaseDocument {
  clientId: string;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastAuthor: 'dietitian' | 'member' | 'system' | null;
  staffReadAt: string | null;
  memberReadAt: string | null;
  unreadForStaff: number;
  unreadForMember: number;
}

export interface DietMessage extends BaseDocument {
  clientId: string;
  author: 'dietitian' | 'member' | 'system';
  authorName: string;
  body: string;
  at: string;
  attachments: DietAttachment[];
  taskId: string | null;
  requestId: string | null;
}

export interface DietTask extends BaseDocument {
  clientId: string;
  title: string;
  description: string;
  category: DietTaskCategory;
  dueDate: string | null;
  status: DietTaskStatus;
  completedAt: string | null;
  completionNote: string;
  attachments: DietAttachment[];
}

export interface DietRequest extends BaseDocument {
  clientId: string;
  type: DietRequestType;
  subject: string;
  detail: string;
  status: DietRequestStatus;
  response: string;
  attachments: DietAttachment[];
  preferredDate: string | null;
  preferredTime: string | null;
  preferredChannel: DietChannel | null;
}

/** Push token of a signed-in staff device; document id = hash of the token. */
export interface DietDevice extends BaseDocument {
  userId: string;
  token: string;
  platform: DietDevicePlatform;
  appVersion: string | null;
}

export interface DietNotificationPrefs {
  messages: boolean;
  requests: boolean;
  tasks: boolean;
  consultationReminders: boolean;
  billing: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

export const DEFAULT_DIET_NOTIFICATION_PREFS: DietNotificationPrefs = {
  messages: true,
  requests: true,
  tasks: true,
  consultationReminders: true,
  billing: true,
  quietHoursStart: null,
  quietHoursEnd: null,
};
