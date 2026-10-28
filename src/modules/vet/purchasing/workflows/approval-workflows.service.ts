import { Injectable } from '@nestjs/common';
import { CreateApprovalWorkflowDto, UpdateApprovalWorkflowDto } from './approval-workflow.dto';
import { ApprovalWorkflow, WorkflowTargetType } from './approval-workflow.entity';
import { ApprovalWorkflowsRepository } from './approval-workflows.repository';

@Injectable()
export class ApprovalWorkflowsService {
  constructor(private readonly repo: ApprovalWorkflowsRepository) {}

  create(dto: CreateApprovalWorkflowDto): Promise<ApprovalWorkflow> {
    return this.repo.create(dto);
  }

  getById(id: string): Promise<ApprovalWorkflow> {
    return this.repo.getByIdOrThrow(id);
  }

  list(): Promise<ApprovalWorkflow[]> {
    return this.repo.collect();
  }

  update(id: string, dto: UpdateApprovalWorkflowDto): Promise<ApprovalWorkflow> {
    return this.repo.update(id, dto);
  }

  delete(id: string): Promise<void> {
    return this.repo.softDelete(id);
  }

  /**
   * Belge türü, tutar ve şubeye en uygun onay senaryosunu bulur
   */
  async findMatchingWorkflow(
    targetType: WorkflowTargetType,
    amount: number,
    branchId?: string | null,
  ): Promise<ApprovalWorkflow | null> {
    const all = await this.repo.collect();
    const active = all.filter((w) => w.active);

    const matches = active.filter((w) => {
      // 1. Belge türü kontrolü
      if (w.targetType !== 'all' && w.targetType !== targetType) return false;
      // 2. Şube kontrolü
      if (w.branchId && branchId && w.branchId !== branchId) return false;
      // 3. Tutar aralığı kontrolü
      if (amount < (w.minAmount || 0)) return false;
      if (w.maxAmount != null && amount > w.maxAmount) return false;
      return true;
    });

    if (matches.length === 0) {
      // Genel kapsayıcı (targetType == 'all') var mı
      return active.find((w) => w.targetType === 'all') || null;
    }

    // En spesifik olanı seç (maxAmount dar olan önce)
    matches.sort((a, b) => {
      const aSpan = (a.maxAmount ?? 99999999) - a.minAmount;
      const bSpan = (b.maxAmount ?? 99999999) - b.minAmount;
      return aSpan - bSpan;
    });
    return matches[0];
  }

  /**
   * Kliniğe başlangıç şablon onay senaryolarını yükler
   */
  async seedDefaultWorkflows(): Promise<ApprovalWorkflow[]> {
    const existing = await this.repo.collect();
    if (existing.length > 0) return existing;

    const standard = await this.repo.create({
      name: 'Standart Talep & Satınalma Onayı (0 - 25.000 TL)',
      description: 'Rutin klinik malzeme, aşı ve ecza tedarikleri için birim ve sorumlu hekim onay akışı',
      targetType: 'all',
      minAmount: 0,
      maxAmount: 25000,
      autoApproveBelow: 1500,
      active: true,
      steps: [
        {
          stepOrder: 1,
          title: '1. Kademe: Birim Sorumlusu / Başhekim Onayı',
          approverType: 'role',
          approverRole: 'head_vet',
          approverName: 'Birim Sorumlusu & Başhekim',
          approvalPolicy: 'single',
          timeoutHours: 24,
        },
      ],
    });

    const highTier = await this.repo.create({
      name: 'Yüksek Bütçeli Satınalma & Cihaz Onayı (25.000 TL+)',
      description: 'Yüksek montanlı ecza siparişleri, cerrahi cihaz ve demirbaş alımlarında çok kademeli onay',
      targetType: 'all',
      minAmount: 25000,
      maxAmount: null,
      autoApproveBelow: null,
      active: true,
      steps: [
        {
          stepOrder: 1,
          title: '1. Kademe: Başhekim / Teknik Değerlendirme',
          approverType: 'role',
          approverRole: 'head_vet',
          approverName: 'Başhekim / Teknik Komite',
          approvalPolicy: 'single',
          timeoutHours: 24,
        },
        {
          stepOrder: 2,
          title: '2. Kademe: Finans & Satınalma Müdürü Onayı',
          approverType: 'role',
          approverRole: 'admin',
          approverName: 'Finans ve Muhasebe Yönetimi',
          approvalPolicy: 'single',
          timeoutHours: 48,
        },
        {
          stepOrder: 3,
          title: '3. Kademe: Genel Müdür / Yönetim Kurulu Onayı',
          approverType: 'role',
          approverRole: 'owner',
          approverName: 'Klinik Sahibi / Yönetim Kurulu',
          approvalPolicy: 'single',
          timeoutHours: 72,
        },
      ],
    });

    return [standard, highTier];
  }
}
