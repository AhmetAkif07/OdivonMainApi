import { VetReportsService } from './reports.service';

describe('VetReportsService', () => {
  let service: VetReportsService;

  beforeEach(() => {
    const mockDb = {
      collection: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ docs: [] }),
      }),
    };
    const mockFirebase = { db: mockDb } as any;
    const mockTenantContext = { getTenantId: () => 'demo-tenant', getUserId: () => 'user-1' } as any;
    service = new VetReportsService(mockFirebase, mockTenantContext);
  });

  it('should return executive summary', async () => {
    const res = await service.getSummary({});
    expect(res).toBeDefined();
    expect(res.totalRevenue).toBeGreaterThan(0);
    expect(res.completedExaminations).toBeGreaterThan(0);
  });

  it('should return multi branch report', async () => {
    const res = await service.getMultiBranch({});
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBeGreaterThan(0);
  });

  it('should return clinical report', async () => {
    const res = await service.getClinical({});
    expect(res.topDiagnoses.length).toBeGreaterThan(0);
    expect(res.speciesDistribution.length).toBeGreaterThan(0);
  });
});
