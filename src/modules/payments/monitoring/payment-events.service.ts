import { randomUUID } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';

export const PAYMENT_EVENTS_COLLECTION = 'paymentEvents';

export type PaymentEventLevel = 'info' | 'warn' | 'error';

/** Each step of an online payment, in the order they normally happen. */
export type PaymentEventType =
  | 'order_created'
  | 'checkout_created'
  | 'checkout_reused'
  | 'checkout_failed'
  | 'notification_received'
  | 'notification_rejected'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'payment_sandbox_succeeded'
  | 'subscription_activated'
  | 'review_flagged'
  | 'review_resolved'
  | 'mode_changed';

export interface PaymentEventInput {
  type: PaymentEventType;
  level?: PaymentEventLevel;
  message: string;
  sessionId?: string | null;
  orderId?: string | null;
  tenantId?: string | null;
  provider?: string | null;
  source?: string | null;
  product?: string | null;
  mode?: 'sandbox' | 'live' | null;
  amountKurus?: number | null;
  detail?: Record<string, unknown> | null;
}

export interface PaymentEventDoc extends Required<Omit<PaymentEventInput, 'detail'>> {
  id: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

/** Signatures and secrets never go into the log, even when a provider echoes them back. */
const SECRET_KEYS = new Set(['hash', 'token', 'paytr_token', 'merchant_key', 'merchant_salt', 'merchantKey', 'merchantSalt', 'apiKey', 'secretKey']);

export function sanitizePaymentDetail(detail?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!detail) return null;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (value === undefined) continue;
    result[key] = SECRET_KEYS.has(key) ? '[REDACTED]' : typeof value === 'string' ? value.slice(0, 1000) : value;
  }
  return result;
}

/**
 * Payment movement log for the management panel (`paymentEvents`). Writing is best effort: a log
 * failure is only logged to the console and never breaks a checkout or a provider notification.
 */
@Injectable()
export class PaymentEventsService {
  private readonly logger = new Logger(PaymentEventsService.name);

  constructor(@Optional() private readonly firebase?: FirebaseService) {}

  async record(input: PaymentEventInput): Promise<void> {
    if (!this.firebase) return;
    const id = randomUUID();
    const event: PaymentEventDoc = {
      id,
      type: input.type,
      level: input.level ?? 'info',
      message: input.message,
      sessionId: input.sessionId ?? null,
      orderId: input.orderId ?? null,
      tenantId: input.tenantId ?? null,
      provider: input.provider ?? null,
      source: input.source ?? null,
      product: input.product ?? null,
      mode: input.mode ?? null,
      amountKurus: input.amountKurus ?? null,
      detail: sanitizePaymentDetail(input.detail),
      createdAt: new Date().toISOString(),
    };
    try {
      await this.firebase.db.collection(PAYMENT_EVENTS_COLLECTION).doc(id).set(event);
    } catch (error) {
      this.logger.warn(`Payment event ${input.type} could not be stored: ${(error as Error).message}`);
    }
  }
}
