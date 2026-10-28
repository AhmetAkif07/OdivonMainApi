import { ApprovalWorkflowsService } from './approval-workflows.service';

describe('ApprovalWorkflowsService', () => {
  let service: ApprovalWorkflowsService;
  let repoMock: any;

  beforeEach(() => {
    repoMock = {
      create: jest.fn().mockImplementation((dto) => Promise.resolve({ id: 'wf-1', ...dto })),
      collect: jest.fn().mockResolvedValue([]),
      getByIdOrThrow: jest.fn().mockResolvedValue({ id: 'wf-1', name: 'Test' }),
      update: jest.fn().mockResolvedValue({ id: 'wf-1' }),
      softDelete: jest.fn().mockResolvedValue(undefined),
    };
    service = new ApprovalWorkflowsService(repoMock);
  });

  it('should seed default workflows when empty', async () => {
    const res = await service.seedDefaultWorkflows();
    expect(res.length).toBe(2);
    expect(repoMock.create).toHaveBeenCalledTimes(2);
  });

  it('should find matching workflow by targetType and amount', async () => {
    repoMock.collect.mockResolvedValue([
      { id: 'w-1', name: 'Küçük', active: true, targetType: 'all', minAmount: 0, maxAmount: 10000 },
      { id: 'w-2', name: 'Büyük', active: true, targetType: 'all', minAmount: 10000, maxAmount: null },
    ]);

    const matchSmall = await service.findMatchingWorkflow('demand', 5000);
    expect(matchSmall?.id).toBe('w-1');

    const matchBig = await service.findMatchingWorkflow('rfq', 45000);
    expect(matchBig?.id).toBe('w-2');
  });
});
