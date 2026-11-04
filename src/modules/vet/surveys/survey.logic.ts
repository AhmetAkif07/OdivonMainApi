import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { SurveyAnswer, SurveyInvite, SurveyQuestion, SurveyQuestionSummary, SurveySummary } from './survey.entity';

const MAX_TEXT_LENGTH = 2000;
const LATEST_TEXTS = 10;

function invalid(message: string): AppException {
  return new AppException(ErrorCode.SURVEY_INVALID, message);
}

/** Checks a template's questions; returns them trimmed with ids filled in. */
export function normalizeQuestions(questions: SurveyQuestion[], newId: () => string): SurveyQuestion[] {
  if (!questions.length) {
    throw invalid('Ankette en az bir soru olmalı');
  }
  const ids = new Set<string>();
  return questions.map((question) => {
    const id = question.id?.trim() || newId();
    if (ids.has(id)) {
      throw invalid('Soru kimlikleri benzersiz olmalı');
    }
    ids.add(id);
    const text = question.text.trim();
    if (!text) {
      throw invalid('Soru metni boş olamaz');
    }
    const options = question.type === 'choice' ? (question.options ?? []).map((o) => o.trim()).filter(Boolean) : [];
    if (question.type === 'choice' && options.length < 2) {
      throw invalid(`"${text}" sorusu için en az iki seçenek girin`);
    }
    return { id, type: question.type, text, options, required: question.required ?? true };
  });
}

/** Validates submitted answers against the questions and returns the cleaned answers. */
export function validateAnswers(questions: SurveyQuestion[], answers: SurveyAnswer[]): SurveyAnswer[] {
  const byId = new Map(answers.map((answer) => [answer.questionId, answer.value]));
  const cleaned: SurveyAnswer[] = [];
  for (const question of questions) {
    const raw = byId.get(question.id);
    const empty = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) {
      if (question.required) {
        throw invalid(`"${question.text}" sorusunu yanıtlayın`);
      }
      continue;
    }
    switch (question.type) {
      case 'rating':
      case 'nps': {
        const value = Number(raw);
        const max = question.type === 'rating' ? 5 : 10;
        const min = question.type === 'rating' ? 1 : 0;
        if (!Number.isInteger(value) || value < min || value > max) {
          throw invalid(`"${question.text}" için ${min}-${max} arası bir puan seçin`);
        }
        cleaned.push({ questionId: question.id, value });
        break;
      }
      case 'choice': {
        const value = String(raw);
        if (!question.options.includes(value)) {
          throw invalid(`"${question.text}" için listeden bir seçenek seçin`);
        }
        cleaned.push({ questionId: question.id, value });
        break;
      }
      case 'text':
        cleaned.push({ questionId: question.id, value: String(raw).trim().slice(0, MAX_TEXT_LENGTH) });
        break;
    }
  }
  return cleaned;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function npsOf(promoters: number, detractors: number, total: number): number | null {
  return total ? Math.round(((promoters - detractors) / total) * 100) : null;
}

/** Builds per-question statistics from answered invites (newest first for the text samples). */
export function summarize(invites: SurveyInvite[], templateId: string | null): SurveySummary {
  const live = invites.filter((invite) => invite.status !== 'cancelled');
  const answered = live
    .filter((invite) => invite.status === 'answered' && invite.answers)
    .sort((a, b) => (b.answeredAt ?? '').localeCompare(a.answeredAt ?? ''));

  // Question list: from the newest invite that carries each question, so renamed questions keep one row.
  const questionMap = new Map<string, SurveyQuestion>();
  for (const invite of [...live].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    for (const question of invite.questions) {
      if (!questionMap.has(question.id)) questionMap.set(question.id, question);
    }
  }

  let npsPromoters = 0;
  let npsDetractors = 0;
  let npsTotal = 0;
  let ratingSum = 0;
  let ratingCount = 0;

  const questions: SurveyQuestionSummary[] = [...questionMap.values()].map((question) => {
    const values = answered
      .map((invite) => invite.answers!.find((answer) => answer.questionId === question.id)?.value)
      .filter((value): value is number | string => value !== undefined);
    const numbers = values.map(Number).filter((value) => Number.isFinite(value));
    const summary: SurveyQuestionSummary = {
      questionId: question.id,
      text: question.text,
      type: question.type,
      answerCount: values.length,
      average: null,
      npsScore: null,
      promoters: 0,
      passives: 0,
      detractors: 0,
      optionCounts: [],
      latestTexts: [],
    };
    if (question.type === 'rating' || question.type === 'nps') {
      summary.average = numbers.length ? round1(numbers.reduce((a, b) => a + b, 0) / numbers.length) : null;
    }
    if (question.type === 'rating') {
      ratingSum += numbers.reduce((a, b) => a + b, 0);
      ratingCount += numbers.length;
    }
    if (question.type === 'nps') {
      summary.promoters = numbers.filter((value) => value >= 9).length;
      summary.detractors = numbers.filter((value) => value <= 6).length;
      summary.passives = numbers.length - summary.promoters - summary.detractors;
      summary.npsScore = npsOf(summary.promoters, summary.detractors, numbers.length);
      npsPromoters += summary.promoters;
      npsDetractors += summary.detractors;
      npsTotal += numbers.length;
    }
    if (question.type === 'choice') {
      const counts = new Map(question.options.map((option) => [option, 0]));
      for (const value of values) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
      summary.optionCounts = [...counts.entries()].map(([option, count]) => ({ option, count }));
    }
    if (question.type === 'text') {
      summary.latestTexts = values.map(String).filter(Boolean).slice(0, LATEST_TEXTS);
    }
    return summary;
  });

  const total = live.length;
  return {
    templateId,
    sent: total - answered.length,
    answered: answered.length,
    responseRate: total ? Math.round((answered.length / total) * 100) : 0,
    npsScore: npsOf(npsPromoters, npsDetractors, npsTotal),
    averageRating: ratingCount ? round1(ratingSum / ratingCount) : null,
    questions,
  };
}
