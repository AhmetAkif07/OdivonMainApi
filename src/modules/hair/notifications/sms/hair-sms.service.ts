import { Injectable, Logger } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { maskPhone } from '../../shared/hair-phone';
import { HairStore } from '../../shared/hair-store';
import { SmsProvider, smsProviderFromEnv } from './sms-provider';

/** Marks SMS send-log rows in `hairNotifications` (kept out of the staff notification centre). */
export const SMS_LOG_KIND = 'smsLog';

export interface SmsMessage {
  /** E.164 phone. */
  to: string;
  text: string;
  /** `bookingOtp`, `appointmentConfirmation`, `appointmentReminder`, `appointmentCancellation`, … */
  type: string;
  customerId?: string | null;
  branchId?: string | null;
  appointmentId?: string | null;
  /** Keep the text out of the log (one-time codes). */
  redact?: boolean;
}

/**
 * Sends SMS for the current tenant through the configured gateway (env: SMS_PROVIDER / NETGSM_*)
 * and records every attempt in `hairNotifications` (`kind: smsLog`, status sent|failed).
 */
@Injectable()
export class HairSmsService {
  private readonly logger = new Logger(HairSmsService.name);
  private provider: SmsProvider = smsProviderFromEnv();

  constructor(private readonly store: HairStore) {}

  /** Tests and alternative gateways. */
  useProvider(provider: SmsProvider): void {
    this.provider = provider;
  }

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  async send(message: SmsMessage): Promise<{ ok: boolean; logId: string; error?: string }> {
    const result = await this.provider.send(message.to, message.text);
    if (!result.ok) this.logger.warn(`SMS ${message.type} failed: ${result.error}`);
    const ref = this.store.newRef(TENANT_COLLECTION.hairNotifications);
    const now = new Date().toISOString();
    try {
      await ref.set(
        this.store.stamp(ref, {
          kind: SMS_LOG_KIND,
          recipientId: null,
          channel: 'sms',
          type: message.type,
          customerId: message.customerId ?? null,
          branchId: message.branchId ?? null,
          appointmentId: message.appointmentId ?? null,
          to: message.to,
          toMasked: maskPhone(message.to),
          title: message.type,
          body: message.redact ? '[gizlendi]' : message.text,
          provider: this.provider.name,
          providerMessageId: result.providerMessageId ?? null,
          status: result.ok ? 'sent' : 'failed',
          error: result.error ?? null,
          sentAt: result.ok ? now : null,
          readAt: null,
        }),
      );
    } catch (error) {
      this.logger.error(`Failed to log SMS ${message.type}`, error as Error);
    }
    return { ok: result.ok, logId: ref.id, error: result.error };
  }
}
