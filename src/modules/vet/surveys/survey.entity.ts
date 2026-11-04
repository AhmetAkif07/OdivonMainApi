import { BaseDocument } from '../../../shared/firestore/base-document';

/** rating: 1-5 stars, nps: 0-10 "would you recommend", choice: one of `options`, text: free text. */
export const SURVEY_QUESTION_TYPES = ['rating', 'nps', 'choice', 'text'] as const;
export type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[number];

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  text: string;
  options: string[];
  required: boolean;
}

export interface SurveyTemplate extends BaseDocument {
  name: string;
  description: string | null;
  /** Shown to the customer after they submit. */
  thankYouMessage: string | null;
  questions: SurveyQuestion[];
  active: boolean;
}

export const SURVEY_INVITE_STATUSES = ['sent', 'answered', 'cancelled'] as const;
export type SurveyInviteStatus = (typeof SURVEY_INVITE_STATUSES)[number];

export interface SurveyAnswer {
  questionId: string;
  /** Number for rating/nps, the chosen option for choice, text for text. */
  value: number | string;
}

/** One survey sent to one customer. The answers are stored on the same document once submitted. */
export interface SurveyInvite extends BaseDocument {
  templateId: string;
  templateName: string;
  /** Copied from the template when sent, so later template edits do not change open links. */
  questions: SurveyQuestion[];
  thankYouMessage: string | null;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  patientId: string | null;
  patientName: string | null;
  appointmentId: string | null;
  /** Random link token; also the key of the public lookup doc (stored there as its sha256). */
  token: string;
  status: SurveyInviteStatus;
  expiresAt: string;
  answeredAt: string | null;
  answers: SurveyAnswer[] | null;
  comment: string | null;
}

/** Root-level lookup so the public link can find the tenant without a login. Doc id = sha256(token). */
export interface SurveyTokenLookup {
  tenantId: string;
  inviteId: string;
  customerId: string;
  patientId: string | null;
  expiresAt: string;
  answeredAt: string | null;
  cancelled: boolean;
}

export interface SurveyQuestionSummary {
  questionId: string;
  text: string;
  type: SurveyQuestionType;
  answerCount: number;
  /** rating and nps */
  average: number | null;
  /** nps only: % promoters (9-10) minus % detractors (0-6) */
  npsScore: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  /** choice only */
  optionCounts: Array<{ option: string; count: number }>;
  /** text only: latest answers */
  latestTexts: string[];
}

export interface SurveySummary {
  templateId: string | null;
  sent: number;
  answered: number;
  /** answered / (sent + answered), 0-100 */
  responseRate: number;
  /** NPS over every nps question answered in the range */
  npsScore: number | null;
  averageRating: number | null;
  questions: SurveyQuestionSummary[];
}

export interface PublicSurveyView {
  clinicName: string;
  logoUrl: string | null;
  templateName: string;
  customerFirstName: string;
  patientName: string | null;
  questions: SurveyQuestion[];
  answered: boolean;
  expired: boolean;
  thankYouMessage: string | null;
}
