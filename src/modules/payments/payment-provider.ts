export type PaymentProviderId = 'iyzico';
export type PaymentSource = 'vet_sale' | 'gym_receivable' | 'saas_subscription';
export type PaymentStatus = 'initializing' | 'pending' | 'succeeded' | 'failed';

export interface CheckoutInput {
  id: string;
  amountKurus: number;
  source: PaymentSource;
  sourceId: string;
  buyer: {
    id: string;
    name: string;
    surname: string;
    identityNumber: string;
    email: string;
    gsmNumber: string;
    address: string;
    city: string;
    country: string;
    ip: string;
  };
  callbackUrl: string;
}

export interface CheckoutResult {
  token: string;
  paymentPageUrl: string;
}

export interface VerifiedPayment {
  status: 'succeeded' | 'failed' | 'pending';
  providerPaymentId: string | null;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  verifyCheckout(token: string, input: Pick<CheckoutInput, 'id' | 'amountKurus'>): Promise<VerifiedPayment>;
}

export interface PaymentSession {
  id: string;
  tenantId: string;
  provider: PaymentProviderId;
  source: PaymentSource;
  sourceId: string;
  amountKurus: number;
  currency: 'TRY';
  status: PaymentStatus;
  token: string | null;
  paymentPageUrl: string | null;
  providerPaymentId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
