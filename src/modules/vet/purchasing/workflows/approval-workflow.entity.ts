import { BaseDocument } from '../../../../shared/firestore/base-document';

export const WORKFLOW_TARGET_TYPES = ['demand', 'rfq', 'purchase_order', 'all'] as const;
export type WorkflowTargetType = (typeof WORKFLOW_TARGET_TYPES)[number];

export const APPROVER_TYPES = ['role', 'user'] as const;
export type ApproverType = (typeof APPROVER_TYPES)[number];

export const APPROVAL_POLICIES = ['single', 'consensus'] as const;
export type ApprovalPolicy = (typeof APPROVAL_POLICIES)[number];

export interface ApprovalStepDefinition {
  stepOrder: number;
  title: string;
  approverType: ApproverType;
  approverRole?: string | null;
  approverUserId?: string | null;
  approverName: string;
  approvalPolicy: ApprovalPolicy;
  timeoutHours?: number | null;
}

export interface ApprovalWorkflow extends BaseDocument {
  name: string;
  description: string | null;
  targetType: WorkflowTargetType;
  minAmount: number;
  maxAmount: number | null;
  branchId: string | null;
  active: boolean;
  autoApproveBelow: number | null;
  steps: ApprovalStepDefinition[];
}
