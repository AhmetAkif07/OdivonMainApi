import { ErrorCode } from '../../../shared/errors/error-codes';
import { SurveyInvite, SurveyQuestion } from './survey.entity';
import { normalizeQuestions, summarize, validateAnswers } from './survey.logic';
import { SurveysService } from './surveys.service';

const questions: SurveyQuestion[] = [
  { id: 'q1', type: 'rating', text: 'Hizmet', options: [], required: true },
  { id: 'q2', type: 'nps', text: 'Tavsiye', options: [], required: true },
  { id: 'q3', type: 'choice', text: 'Bekleme', options: ['Kısa', 'Uzun'], required: false },
  { id: 'q4', type: 'text', text: 'Yorum', options: [], required: false },
];

function invite(overrides: Partial<SurveyInvite>): SurveyInvite {
  return {
    id: 'i',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    createdBy: 'u',
    updatedBy: 'u',
    deletedAt: null,
    templateId: 't1',
    templateName: 'Memnuniyet',
    questions,
    thankYouMessage: null,
    customerId: 'c1',
    customerName: 'Ayşe Kaya',
    customerPhone: null,
    patientId: null,
    patientName: null,
    appointmentId: null,
    token: 'tok',
    status: 'sent',
    expiresAt: '2099-01-01T00:00:00.000Z',
    answeredAt: null,
    answers: null,
    comment: null,
    ...overrides,
  } as SurveyInvite;
}

describe('survey logic', () => {
  it('requires at least two options for a choice question', () => {
    expect(() =>
      normalizeQuestions([{ id: '', type: 'choice', text: 'X', options: ['A'], required: true }], () => 'n'),
    ).toThrow();
    const [q] = normalizeQuestions([{ id: '', type: 'rating', text: ' Puan ', options: ['x'], required: true }], () => 'n1');
    expect(q).toEqual({ id: 'n1', type: 'rating', text: 'Puan', options: [], required: true });
  });

  it('rejects out-of-range scores and missing required answers', () => {
    expect(() => validateAnswers(questions, [{ questionId: 'q1', value: 6 }, { questionId: 'q2', value: 5 }])).toThrow();
    expect(() => validateAnswers(questions, [{ questionId: 'q1', value: 4 }])).toThrow();
    expect(() =>
      validateAnswers(questions, [
        { questionId: 'q1', value: 4 },
        { questionId: 'q2', value: 9 },
        { questionId: 'q3', value: 'Orta' },
      ]),
    ).toThrow();
    expect(
      validateAnswers(questions, [
        { questionId: 'q1', value: '4' },
        { questionId: 'q2', value: 9 },
        { questionId: 'q4', value: '  iyi  ' },
        { questionId: 'zz', value: 1 },
      ]),
    ).toEqual([
      { questionId: 'q1', value: 4 },
      { questionId: 'q2', value: 9 },
      { questionId: 'q4', value: 'iyi' },
    ]);
  });

  it('computes response rate, NPS and averages', () => {
    const summary = summarize(
      [
        invite({ id: 'a', status: 'answered', answeredAt: '2026-11-02', answers: [
          { questionId: 'q1', value: 5 }, { questionId: 'q2', value: 10 }, { questionId: 'q3', value: 'Kısa' },
        ] }),
        invite({ id: 'b', status: 'answered', answeredAt: '2026-11-03', answers: [
          { questionId: 'q1', value: 3 }, { questionId: 'q2', value: 4 }, { questionId: 'q4', value: 'geç kaldınız' },
        ] }),
        invite({ id: 'c', status: 'answered', answeredAt: '2026-11-03', answers: [
          { questionId: 'q1', value: 4 }, { questionId: 'q2', value: 9 },
        ] }),
        invite({ id: 'd' }),
        invite({ id: 'e', status: 'cancelled' }),
      ],
      't1',
    );
    expect(summary.answered).toBe(3);
    expect(summary.sent).toBe(1);
    expect(summary.responseRate).toBe(75);
    expect(summary.averageRating).toBe(4);
    // 2 promoters, 1 detractor out of 3 → 33
    expect(summary.npsScore).toBe(33);
    const choice = summary.questions.find((q) => q.questionId === 'q3')!;
    expect(choice.optionCounts).toEqual([{ option: 'Kısa', count: 1 }, { option: 'Uzun', count: 0 }]);
    expect(summary.questions.find((q) => q.questionId === 'q4')!.latestTexts).toEqual(['geç kaldınız']);
  });
});

describe('SurveysService', () => {
  const repo = {
    getTemplateOrThrow: jest.fn(),
    customerAndPatient: jest.fn(),
    createInvite: jest.fn(),
    getInviteOrThrow: jest.fn(),
    cancelInvite: jest.fn(),
    findLookup: jest.fn(),
    findInviteForTenant: jest.fn(),
    tenantBranding: jest.fn(),
    newId: jest.fn(() => 'gen'),
  };
  let service: SurveysService;

  beforeEach(() => {
    jest.resetAllMocks();
    repo.createInvite.mockImplementation(async (fields) => ({ id: 'inv1', ...fields }));
    service = new SurveysService(repo as never);
  });

  it('copies the template questions and makes a random token when sending', async () => {
    repo.getTemplateOrThrow.mockResolvedValue({ id: 't1', name: 'Memnuniyet', questions, active: true, thankYouMessage: 'Sağ olun' });
    repo.customerAndPatient.mockResolvedValue({ customerName: 'Ayşe Kaya', customerPhone: '555', patientName: 'Pamuk' });
    const result = await service.send({ templateId: 't1', customerId: 'c1', patientId: 'p1' });
    expect(result.questions).toBe(questions);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(result.patientId).toBe('p1');
    expect(result.status).toBe('sent');
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
  });

  it('refuses to send an inactive survey', async () => {
    repo.getTemplateOrThrow.mockResolvedValue({ id: 't1', questions, active: false });
    await expect(service.send({ templateId: 't1', customerId: 'c1' })).rejects.toMatchObject({
      code: ErrorCode.SURVEY_INVALID,
    });
  });

  it('does not cancel an answered survey', async () => {
    repo.getInviteOrThrow.mockResolvedValue(invite({ status: 'answered' }));
    await expect(service.cancelInvite('i')).rejects.toMatchObject({ code: ErrorCode.SURVEY_ALREADY_ANSWERED });
  });

  it('rejects an unknown or cancelled public link', async () => {
    repo.findLookup.mockResolvedValue(null);
    await expect(service.publicView('nope')).rejects.toMatchObject({ code: ErrorCode.SURVEY_LINK_INVALID });
    repo.findLookup.mockResolvedValue({ tenantId: 't', inviteId: 'i', cancelled: true });
    await expect(service.publicView('x')).rejects.toMatchObject({ code: ErrorCode.SURVEY_LINK_INVALID });
  });

  it('shows the public view with the first name only', async () => {
    repo.findLookup.mockResolvedValue({ tenantId: 't', inviteId: 'i', cancelled: false });
    repo.findInviteForTenant.mockResolvedValue(invite({}));
    repo.tenantBranding.mockResolvedValue({ name: 'Pati Klinik', logoUrl: null });
    const view = await service.publicView('tok');
    expect(view).toMatchObject({ clinicName: 'Pati Klinik', customerFirstName: 'Ayşe', answered: false, expired: false });
  });
});
