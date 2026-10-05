import { Test, TestingModule } from '@nestjs/testing';
import { CrmRepository } from './crm.repository';
import { CrmService } from './crm.service';

describe('CrmService', () => {
  let service: CrmService;

  const mockRepo = {
    listLogs: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    createLog: jest.fn().mockImplementation((dto: any) =>
      Promise.resolve({ id: 'log-1', ...dto, sentAt: '2026-03-01T10:00:00.000Z' }),
    ),
    getReminderCandidates: jest.fn().mockResolvedValue({
      vaccineReminders: [
        {
          id: 'v-1',
          type: 'vaccine',
          patientName: 'Duman',
          vaccineName: 'Kuduz Aşısı',
          customerPhone: '05554443322',
          isOverdue: false,
        },
      ],
      appointmentReminders: [],
      totalCandidates: 1,
    }),
    getPetVetSummary: jest.fn().mockResolvedValue({
      totalPatients: 10,
      chippedPatients: 8,
      unchippedPatients: 2,
      chipComplianceRate: 80,
      missingCustomerNationalIdCount: 1,
      rabiesVaccinatedCount: 7,
      rabiesExpiringCount: 1,
      nonCompliantPatients: [],
    }),
    getPetVetExportData: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrmService,
        { provide: CrmRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<CrmService>(CrmService);
  });

  it('creates and records communication log', async () => {
    const log = await service.createLog({
      channel: 'whatsapp',
      category: 'vaccine_reminder',
      recipientPhone: '05554443322',
      recipientName: 'Ali Veli',
      patientName: 'Duman',
      messageContent: 'Aşı hatırlatma mesajı',
    });

    expect(log).toBeDefined();
    expect(log.channel).toBe('whatsapp');
    expect(mockRepo.createLog).toHaveBeenCalled();
  });

  it('retrieves reminder candidates and petvet compliance summary', async () => {
    const reminders = await service.getReminderCandidates();
    expect(reminders.vaccineReminders.length).toBe(1);

    const summary = await service.getPetVetSummary();
    expect(summary.chipComplianceRate).toBe(80);
    expect(summary.chippedPatients).toBe(8);
  });
});
