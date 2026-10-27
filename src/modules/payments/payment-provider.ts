export type PaymentProviderId = 'iyzico' | 'paytr';
export type PaymentSource = 'vet_sale' | 'gym_receivable' | 'saas_subscription' | 'gym_member_package' | 'gym_wallet_topup' | 'rentacar_reservation';
/** `abandoned`: superseded or expired before a result; still verifiable if paid on an old tab. */
export type PaymentStatus = 'initializing' | 'pending' | 'succeeded' | 'failed' | 'abandoned';

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

export interface IyzicoCredentials {
  apiKey: string;
  secretKey: string;
  mode: 'sandbox' | 'live';
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  mode(): 'sandbox' | 'live';
  configured(): boolean;
  /** Without credentials the platform (SaaS) keys are used. */
  createCheckout(input: CheckoutInput, credentials?: IyzicoCredentials): Promise<CheckoutResult>;
  verifyCheckout(token: string, input: Pick<CheckoutInput, 'id' | 'amountKurus'>, credentials?: IyzicoCredentials): Promise<VerifiedPayment>;
  testCredentials(credentials: IyzicoCredentials): Promise<{ ok: boolean; message: string | null }>;
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
  /** Member whose wallet / membership / debt the payment is for (gym sources). */
  userId?: string | null;
  /** Panel origin the browser returns to after the payment page. */
  returnOrigin?: string | null;
  /** Set when the gym-side effect (wallet, membership, debt) was applied. */
  fulfilledAt?: string | null;
  reviewPending?: boolean;
  /** Whose iyzico keys created the checkout: the gym's own or the platform's (SaaS). */
  credentialScope?: 'tenant' | 'platform';
  /** iyzico environment the checkout ran in; only live SaaS payments activate a subscription. */
  mode?: 'sandbox' | 'live';
}
