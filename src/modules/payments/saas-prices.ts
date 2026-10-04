// TEST: every plan costs 1 TL so a real card payment can be tried end to end.
// Restore before launch: starter 1490/14900, pro 2990/29900, enterprise 5990/59900.
export const SAAS_SANDBOX_PRICES = {
  starter: { monthly: 1, yearly: 1 },
  pro: { monthly: 1, yearly: 1 },
  enterprise: { monthly: 1, yearly: 1 },
} as const;
