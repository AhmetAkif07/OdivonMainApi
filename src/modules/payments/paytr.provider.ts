import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { CheckoutInput, CheckoutResult } from './payment-provider';

const GET_TOKEN_URL = 'https://www.paytr.com/odeme/api/get-token';
const IFRAME_URL = 'https://www.paytr.com/odeme/guvenli/';

export interface PaytrCredentials {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
}

interface PaytrTokenResponse {
  status?: string;
  token?: string;
  reason?: string;
}

/** HMAC-SHA256 keyed with the merchant key, base64 encoded (PayTR's signature format). */
export function paytrSign(merchantKey: string, message: string): string {
  return createHmac('sha256', merchantKey).update(message).digest('base64');
}

/** PayTR `merchant_oid` accepts letters and digits only, so the session UUID is sent without dashes. */
export function paytrMerchantOid(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9]/g, '');
}

/** Inverse of paytrMerchantOid: 32 hex digits back to a UUID, or null for anything else. */
export function paytrSessionId(merchantOid: string): string | null {
  const hex = merchantOid.toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Basket is sent base64 encoded as `[[name, price, quantity]]` with the price in TL. */
export function paytrBasket(name: string, amountKurus: number): string {
  return Buffer.from(JSON.stringify([[name, (amountKurus / 100).toFixed(2), 1]])).toString('base64');
}

/**
 * Checks the callback `hash` PayTR posts to the notification URL:
 * base64(HMAC(merchant_oid + merchant_salt + status + total_amount, merchant_key)).
 */
export function verifyPaytrCallbackHash(credentials: PaytrCredentials, fields: { merchantOid: string; status: string; totalAmount: string; hash: string }): boolean {
  if (!fields.hash) return false;
  const expected = Buffer.from(paytrSign(credentials.merchantKey, fields.merchantOid + credentials.merchantSalt + fields.status + fields.totalAmount));
  const received = Buffer.from(fields.hash);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

@Injectable()
export class PaytrProvider {
  readonly id = 'paytr' as const;

  /**
   * Platform keys come from Worker secrets: PAYTR_MERCHANT_ID / PAYTR_MERCHANT_KEY / PAYTR_MERCHANT_SALT.
   * PAYTR_MODE=live selects live; anything else is sandbox (PayTR test_mode=1).
   */
  mode(): 'sandbox' | 'live' {
    return process.env.PAYTR_MODE === 'live' ? 'live' : 'sandbox';
  }

  configured(): boolean {
    return Boolean(process.env.PAYTR_MERCHANT_ID && process.env.PAYTR_MERCHANT_KEY && process.env.PAYTR_MERCHANT_SALT);
  }

  platformCredentials(): PaytrCredentials {
    const merchantId = process.env.PAYTR_MERCHANT_ID;
    const merchantKey = process.env.PAYTR_MERCHANT_KEY;
    const merchantSalt = process.env.PAYTR_MERCHANT_SALT;
    if (!merchantId || !merchantKey || !merchantSalt) {
      throw new AppException(ErrorCode.INVALID_STATUS, 'PayTR credentials are not configured');
    }
    return { merchantId, merchantKey, merchantSalt };
  }

  /** Creates an iFrame token; the buyer pays on the returned PayTR page. */
  async createCheckout(input: CheckoutInput, credentials = this.platformCredentials()): Promise<CheckoutResult> {
    const merchantOid = paytrMerchantOid(input.id);
    const userIp = input.buyer.ip;
    const email = input.buyer.email;
    const paymentAmount = String(input.amountKurus);
    const userBasket = paytrBasket(input.source, input.amountKurus);
    const noInstallment = '1';
    const maxInstallment = '0';
    const currency = 'TL';
    const testMode = this.mode() === 'live' ? '0' : '1';
    const paytrToken = paytrSign(credentials.merchantKey,
      credentials.merchantId + userIp + merchantOid + email + paymentAmount + userBasket +
      noInstallment + maxInstallment + currency + testMode + credentials.merchantSalt);

    const form = new URLSearchParams({
      merchant_id: credentials.merchantId, user_ip: userIp, merchant_oid: merchantOid, email,
      payment_amount: paymentAmount, paytr_token: paytrToken, user_basket: userBasket,
      debug_on: '0', no_installment: noInstallment, max_installment: maxInstallment, user_name: `${input.buyer.name} ${input.buyer.surname}`,
      user_address: input.buyer.address, user_phone: input.buyer.gsmNumber, merchant_ok_url: input.callbackUrl,
      merchant_fail_url: input.callbackUrl, timeout_limit: '30', currency, test_mode: testMode,
    });

    let response: Response;
    try {
      response = await fetch(GET_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'PayTR is unavailable');
    }
    if (!response.ok) throw new AppException(ErrorCode.FINANCE_INVALID, `PayTR returned HTTP ${response.status}`);
    let body: PaytrTokenResponse;
    try { body = await response.json() as PaytrTokenResponse; }
    catch { throw new AppException(ErrorCode.FINANCE_INVALID, 'PayTR returned an invalid response'); }
    if (body.status !== 'success' || !body.token) {
      throw new AppException(ErrorCode.FINANCE_INVALID, `PayTR checkout could not be initialized${body.reason ? `: ${body.reason}` : ''}`);
    }
    return { token: body.token, paymentPageUrl: `${IFRAME_URL}${body.token}` };
  }
}
