import { BaseDocument } from '../../../../shared/firestore/base-document';

/** commission: per sold line; target: one bonus when a person's net sales reach a threshold. */
export const COMMISSION_KINDS = ['commission', 'target'] as const;
export type CommissionKind = (typeof COMMISSION_KINDS)[number];

/** Which lines a commission rule covers; the most specific matching rule wins for a line. */
export const COMMISSION_SCOPES = ['all', 'productType', 'category', 'product'] as const;
export type CommissionScope = (typeof COMMISSION_SCOPES)[number];

/** percent: % of the line's net amount (after discounts, without VAT); perUnit: fixed TL per unit. */
export const COMMISSION_BASES = ['percent', 'perUnit'] as const;
export type CommissionBasis = (typeof COMMISSION_BASES)[number];

export interface CommissionRule extends BaseDocument {
  name: string;
  kind: CommissionKind;
  /** null = applies to everyone. */
  userId: string | null;
  staffName: string | null;
  active: boolean;
  scope: CommissionScope;
  /** productType values ('product' | 'service' | 'vaccine'), category ids or product ids. */
  targetIds: string[];
  basis: CommissionBasis;
  rate: number;
  /** target rules: net sales the person must reach in the period. */
  threshold: number;
  /** target rules: bonus paid when the threshold is reached. */
  amount: number;
}

export interface CommissionRuleLine {
  ruleId: string;
  ruleName: string;
  kind: CommissionKind;
  base: number;
  amount: number;
}

export interface CommissionReportRow {
  userId: string;
  staffName: string;
  saleCount: number;
  /** Net sales (without VAT) credited to the person. */
  salesNet: number;
  commission: number;
  targetBonus: number;
  total: number;
  rules: CommissionRuleLine[];
}

export interface CommissionReport {
  from: string;
  to: string;
  rows: CommissionReportRow[];
  totals: { salesNet: number; commission: number; targetBonus: number; total: number };
  /** Sales whose seller could not be determined. */
  unassignedSales: number;
}
