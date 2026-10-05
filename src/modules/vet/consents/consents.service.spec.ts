import { Test, TestingModule } from '@nestjs/testing';
import { ConsentFormsRepository } from './consent-forms.repository';
import { ConsentFormsService } from './consent-forms.service';

describe('ConsentFormsService', () => {
  let service: ConsentFormsService;

  const mockRepo = {
    list: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    getByIdOrThrow: jest.fn().mockImplementation((id: string) =>
      Promise.resolve({
        id,
        type: 'operation',
        title: 'Cerrahi Operasyon Rıza Belgesi',
        customerId: 'c-1',
        customerName: 'Ahmet Yılmaz',
        customerPhone: '05551112233',
        patientId: 'p-1',
        patientName: 'Pamuk',
        riskAcknowledgment: true,
        anesthesiaApproval: true,
        emergencyInterventionApproval: true,
        signatureDataUrl: 'data:image/png;base64,mock',
        signedAt: '2026-03-01T10:00:00.000Z',
        status: 'signed',
      }),
    ),
    create: jest.fn().mockImplementation((dto: any) => Promise.resolve({ id: 'form-1', ...dto })),
    update: jest.fn().mockImplementation((id: string, dto: any) => Promise.resolve({ id, ...dto })),
    softDelete: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsentFormsService,
        { provide: ConsentFormsRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<ConsentFormsService>(ConsentFormsService);
  });

  it('creates and signs a consent form', async () => {
    const res = await service.create({
      type: 'operation',
      title: 'Cerrahi Operasyon Rıza Belgesi',
      customerId: 'c-1',
      customerName: 'Ahmet Yılmaz',
      customerPhone: '05551112233',
      patientId: 'p-1',
      patientName: 'Pamuk',
      riskAcknowledgment: true,
      anesthesiaApproval: true,
      emergencyInterventionApproval: true,
      signatureDataUrl: 'data:image/png;base64,signature',
    });

    expect(res).toBeDefined();
    expect(res.id).toBe('form-1');
    expect(mockRepo.create).toHaveBeenCalled();
  });

  it('retrieves a consent form by id', async () => {
    const res = await service.getById('form-1');
    expect(res.patientName).toBe('Pamuk');
    expect(res.riskAcknowledgment).toBe(true);
  });
});
