import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { ApprovalWorkflowsService } from '../workflows/approval-workflows.service';
import { DecideApprovalDto, ListApprovalRequestsQueryDto, SubmitApprovalDto } from './approval-request.dto';
import {
  ApprovalRequest,
  ApprovalStatus,
  ApprovalStepExecution,
} from './approval-request.entity';
import { ApprovalRequestsRepository } from './approval-requests.repository';

@Injectable()
export class ApprovalRequestsService {
  constructor(
    private readonly repo: ApprovalRequestsRepository,
    private readonly workflows: ApprovalWorkflowsService,
    private readonly tenantContext: TenantContext,
  ) {}

  async submit(dto: SubmitApprovalDto): Promise<ApprovalRequest> {
    // Varsa mevcut bekleyen onayı kontrol et
    const existing = await this.repo.findByTarget(dto.targetType, dto.targetId);
    if (existing && existing.status === 'pending') {
      return existing;
    }

    const workflow = await this.workflows.findMatchingWorkflow(
      dto.targetType,
      dto.totalAmount,
      dto.branchId,
    );

    const nowIso = new Date().toISOString();
    const userId = this.tenantContext.getUserId();
    const userName = dto.requestedByUserName || 'Kullanıcı';

    // Otomatik Onay Eşiği kontrolü (örn. 1.500 TL altı)
    if (workflow && workflow.autoApproveBelow != null && dto.totalAmount <= workflow.autoApproveBelow) {
      return this.repo.create({
        workflowId: workflow.id,
        workflowName: workflow.name,
        targetType: dto.targetType,
        targetId: dto.targetId,
        documentNo: dto.documentNo,
        title: dto.title,
        totalAmount: dto.totalAmount,
        branchId: dto.branchId || null,
        requestedByUserId: userId,
        requestedByUserName: userName,
        requestedAt: nowIso,
        status: 'approved',
        currentStepOrder: 1,
        totalSteps: 1,
        steps: [
          {
            stepOrder: 1,
            title: 'Sistem Otomatik Onayı',
            approverType: 'role',
            approverName: 'Sistem Motoru',
            approvalPolicy: 'single',
            status: 'approved',
            actionByUserId: 'system',
            actionByUserName: 'Otomatik Kural Motoru',
            actionAt: nowIso,
            comment: `Tutar (${dto.totalAmount} TL) otomatik onay eşiği (${workflow.autoApproveBelow} TL) altında kaldığından onaylandı.`,
          },
        ],
        history: [
          {
            timestamp: nowIso,
            stepOrder: 1,
            stepTitle: 'Otomatik Onay',
            action: 'auto_approved',
            userId: 'system',
            userName: 'Sistem',
            comment: 'Otomatik kural eşiği ile onaylandı.',
          },
        ],
        finalDecisionAt: nowIso,
        finalDecisionByUserId: 'system',
        finalDecisionByUserName: 'Sistem Motoru',
      });
    }

    // Normal Kademeli Onay Akışı
    const steps: ApprovalStepExecution[] = workflow
      ? workflow.steps.map((s, idx) => ({
          stepOrder: s.stepOrder || idx + 1,
          title: s.title,
          approverType: s.approverType,
          approverRole: s.approverRole || null,
          approverUserId: s.approverUserId || null,
          approverName: s.approverName,
          approvalPolicy: s.approvalPolicy || 'single',
          status: idx === 0 ? 'pending' : 'pending',
        }))
      : [
          {
            stepOrder: 1,
            title: '1. Kademe: Sorumlu Hekim / Yönetici Onayı',
            approverType: 'role',
            approverRole: 'head_vet',
            approverName: 'Birim Sorumlusu',
            approvalPolicy: 'single',
            status: 'pending',
          },
        ];

    return this.repo.create({
      workflowId: workflow ? workflow.id : null,
      workflowName: workflow ? workflow.name : 'Varsayılan Onay Akışı',
      targetType: dto.targetType,
      targetId: dto.targetId,
      documentNo: dto.documentNo,
      title: dto.title,
      totalAmount: dto.totalAmount,
      branchId: dto.branchId || null,
      requestedByUserId: userId,
      requestedByUserName: userName,
      requestedAt: nowIso,
      status: 'pending',
      currentStepOrder: 1,
      totalSteps: steps.length,
      steps,
      history: [
        {
          timestamp: nowIso,
          stepOrder: 1,
          stepTitle: 'Başvuru',
          action: 'submitted',
          userId,
          userName,
          comment: `${dto.documentNo} nolu belge onaya gönderildi.`,
        },
      ],
    });
  }

  async decide(id: string, dto: DecideApprovalDto): Promise<ApprovalRequest> {
    const item = await this.repo.getByIdOrThrow(id);
    if (item.status !== 'pending') {
      throw new AppException(ErrorCode.INVALID_STATUS, `Bu onay talebi zaten '${item.status}' durumundadır.`);
    }

    const currentStep = item.steps.find((s) => s.stepOrder === item.currentStepOrder);
    if (!currentStep) {
      throw new AppException(ErrorCode.STOCK_INVALID, 'Aktif onay adımı bulunamadı');
    }

    const nowIso = new Date().toISOString();
    const userId = this.tenantContext.getUserId();
    const userName = 'Onay Yetkilisi'; // In production, resolved from identity

    currentStep.actionByUserId = userId;
    currentStep.actionByUserName = userName;
    currentStep.actionAt = nowIso;
    currentStep.comment = dto.comment || null;

    if (dto.decision === 'rejected') {
      currentStep.status = 'rejected';
      item.status = 'rejected';
      item.finalDecisionAt = nowIso;
      item.finalDecisionByUserId = userId;
      item.finalDecisionByUserName = userName;

      item.history.push({
        timestamp: nowIso,
        stepOrder: item.currentStepOrder,
        stepTitle: currentStep.title,
        action: 'rejected',
        userId,
        userName,
        comment: dto.comment || 'Talep reddedildi.',
      });
    } else if (dto.decision === 'returned') {
      currentStep.status = 'returned';
      item.status = 'returned';
      item.finalDecisionAt = nowIso;
      item.finalDecisionByUserId = userId;
      item.finalDecisionByUserName = userName;

      item.history.push({
        timestamp: nowIso,
        stepOrder: item.currentStepOrder,
        stepTitle: currentStep.title,
        action: 'returned',
        userId,
        userName,
        comment: dto.comment || 'Revizyon talebiyle geri gönderildi.',
      });
    } else if (dto.decision === 'approved') {
      currentStep.status = 'approved';

      item.history.push({
        timestamp: nowIso,
        stepOrder: item.currentStepOrder,
        stepTitle: currentStep.title,
        action: 'approved',
        userId,
        userName,
        comment: dto.comment || 'Adım onaylandı.',
      });

      if (item.currentStepOrder < item.totalSteps) {
        // Bir sonraki kademeye ilerle
        item.currentStepOrder += 1;
        const nextStep = item.steps.find((s) => s.stepOrder === item.currentStepOrder);
        if (nextStep) nextStep.status = 'pending';
      } else {
        // Tüm adımlar tamamlandı -> Nihai Onaylandı
        item.status = 'approved';
        item.finalDecisionAt = nowIso;
        item.finalDecisionByUserId = userId;
        item.finalDecisionByUserName = userName;
      }
    }

    return this.repo.update(id, item);
  }

  getById(id: string): Promise<ApprovalRequest> {
    return this.repo.getByIdOrThrow(id);
  }

  async list(query: ListApprovalRequestsQueryDto): Promise<ApprovalRequest[]> {
    const all = await this.repo.collect();
    return all
      .filter((r) => !query.status || r.status === query.status)
      .filter((r) => !query.targetType || r.targetType === query.targetType);
  }

  /**
   * Kullanıcının onayını bekleyen istekleri getirir
   */
  async getInbox(): Promise<ApprovalRequest[]> {
    const all = await this.repo.collect();
    return all.filter((r) => r.status === 'pending');
  }
}
