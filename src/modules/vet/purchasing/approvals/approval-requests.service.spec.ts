import { ApprovalRequestsService } from './approval-requests.service';

describe('ApprovalRequestsService', () => {
  let service: ApprovalRequestsService;
  let repoMock: any;
  let workflowsMock: any;
  let tenantContextMock: any;

  beforeEach(() => {
    repoMock = {
      create: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'req-1', ...data })),
      getByIdOrThrow: jest.fn(),
      collect: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation((id, data) => Promise.resolve(data)),
      findByTarget: jest.fn().mockResolvedValue(null),
    };
    workflowsMock = {
      findMatchingWorkflow: jest.fn().mockResolvedValue({
        id: 'wf-1',
        name: 'Standart Akış',
        autoApproveBelow: 1000,
        steps: [
          { stepOrder: 1, title: 'Adım 1', approverType: 'role', approverName: 'Yönetici' },
          { stepOrder: 2, title: 'Adım 2', approverType: 'role', approverName: 'Genel Müdür' },
        ],
      }),
    };
    tenantContextMock = {
      getUserId: () => 'user-123',
    };
    service = new ApprovalRequestsService(repoMock, workflowsMock, tenantContextMock);
  });

  it('should auto-approve when below threshold', async () => {
    const res = await service.submit({
      targetType: 'demand',
      targetId: 'dem-1',
      documentNo: 'TLP-001',
      title: 'Küçük Sarf Alımı',
      totalAmount: 500,
    });
    expect(res.status).toBe('approved');
    expect(res.steps[0].status).toBe('approved');
  });

  it('should require multi-tier approval when above threshold and progress steps', async () => {
    const res = await service.submit({
      targetType: 'demand',
      targetId: 'dem-2',
      documentNo: 'TLP-002',
      title: 'Büyük Alım',
      totalAmount: 25000,
    });
    expect(res.status).toBe('pending');
    expect(res.currentStepOrder).toBe(1);

    repoMock.getByIdOrThrow.mockResolvedValue({
      id: 'req-1',
      status: 'pending',
      currentStepOrder: 1,
      totalSteps: 2,
      steps: [
        { stepOrder: 1, title: 'Adım 1', status: 'pending' },
        { stepOrder: 2, title: 'Adım 2', status: 'pending' },
      ],
      history: [],
    });

    const step1Result = await service.decide('req-1', { decision: 'approved', comment: 'Uygun' });
    expect(step1Result.currentStepOrder).toBe(2);
    expect(step1Result.status).toBe('pending');

    const step2Result = await service.decide('req-1', { decision: 'approved', comment: 'Final onayı verildi' });
    expect(step2Result.status).toBe('approved');
  });
});
