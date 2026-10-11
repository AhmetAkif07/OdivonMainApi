import { BaseDocument } from '../../../../shared/firestore/base-document';
import { ApprovalPolicy, ApproverType } from '../workflows/approval-workflow.entity';

export const APPROVAL_TARGET_TYPES = ['demand', 'rfq', 'purchase_order'] as const;
export type ApprovalTargetType = (typeof APPROVAL_TARGET_TYPES)[number];

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'returned'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const STEP_STATUSES = ['pending', 'approved', 'rejected', 'returned', 'skipped'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export interface ApprovalStepExecution {
  stepOrder: number;
  title: string;
  approverType: ApproverType;
  approverRole?: string | null;
  approverUserId?: string | null;
  approverName: string;
  approvalPolicy: ApprovalPolicy;
  status: StepStatus;
  actionByUserId?: string | null;
  actionByUserName?: string | null;
  actionAt?: string | null;
  comment?: string | null;
}

export interface ApprovalLogItem {
  timestamp: string;
  stepOrder: number;
  stepTitle: string;
  action: 'submitted' | 'approved' | 'rejected' | 'returned' | 'auto_approved';
  userId: string;
  userName: string;
  comment?: string | null;
}

export interface ApprovalRequest extends BaseDocument {
  workflowId: string | null;
  workflowName: string;
  targetType: ApprovalTargetType;
  targetId: string;
  documentNo: string;
  title: string;
  totalAmount: number;
  branchId: string | null;
  requestedByUserId: string;
  requestedByUserName: string;
  requestedAt: string;
  status: ApprovalStatus;
  currentStepOrder: number;
  totalSteps: number;
  steps: ApprovalStepExecution[];
  history: ApprovalLogItem[];
  finalDecisionAt?: string | null;
  finalDecisionByUserId?: string | null;
  finalDecisionByUserName?: string | null;
}
