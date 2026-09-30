import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { CheckoutInput, CheckoutResult, PaymentProvider, VerifiedPayment } from './payment-provider';

const BASE_URL = 'https://sandbox-api.iyzipay.com';
const INITIALIZE = '/payment/iyzipos/checkoutform/initialize/auth/ecom';
const RETRIEVE = '/payment/iyzipos/checkoutform/auth/ecom/detail';

interface IyzicoResponse {
  status?: string;
  errorMessage?: string;
  conversationId?: string;
  token?: string;
  signature?: string;
  paymentPageUrl?: string;
  paymentStatus?: string;
  paymentId?: string;
  currency?: string;
  basketId?: string;
  paidPrice?: number | string;
  price?: number | string;
  fraudStatus?: number;
}

export function iyzicoAuthorization(apiKey: string, secretKey: string, nonce: string, path: string, body: string): string {
  const signature = createHmac('sha256', secretKey).update(nonce + path + body).digest('hex');
  return `IYZWSv2 ${Buffer.from(`apiKey:${apiKey}&randomKey:${nonce}&signature:${signature}`).toString('base64')}`;
}

export function verifyIyzicoSignature(secretKey: string, fields: Array<string | number | undefined>, signature: string | undefined): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature) || fields.some((value) => value === undefined)) return false;
  const normalized = fields.map((value, index) =>
    fields.length === 8 && (index === 5 || index === 6) ? String(Number(value)) : String(value));
  const expected = createHmac('sha256', secretKey).update(normalized.join(':')).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

@Injectable()
export class IyzicoProvider implements PaymentProvider {
  readonly id = 'iyzico' as const;

  private credentials() {
    const apiKey = process.env.IYZICO_SANDBOX_API_KEY;
    const secretKey = process.env.IYZICO_SANDBOX_SECRET_KEY;
    if (!apiKey || !secretKey) {
      throw new AppException(ErrorCode.INVALID_STATUS, 'iyzico sandbox credentials are not configured');
    }
    return { apiKey, secretKey };
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const price = (input.amountKurus / 100).toFixed(2);
    const body = {
      locale: 'tr', conversationId: input.id, price, paidPrice: price, currency: 'TRY',
      basketId: input.id, paymentGroup: 'PRODUCT', callbackUrl: input.callbackUrl,
      buyer: {
        id: input.buyer.id, name: input.buyer.name, surname: input.buyer.surname,
        identityNumber: input.buyer.identityNumber, email: input.buyer.email,
        gsmNumber: input.buyer.gsmNumber, registrationAddress: input.buyer.address,
        city: input.buyer.city, country: input.buyer.country, ip: input.buyer.ip,
      },
      billingAddress: {
        contactName: `${input.buyer.name} ${input.buyer.surname}`, address: input.buyer.address,
        city: input.buyer.city, country: input.buyer.country,
      },
      basketItems: [{ id: input.id, name: `Odivon ${input.source === 'vet_sale' ? 'Vet' : 'Gym'} tahsilat`,
        category1: 'Service', itemType: 'VIRTUAL', price }],
    };
    const response = await this.post(INITIALIZE, body);
    const { secretKey } = this.credentials();
    if (response.status !== 'success' || !response.token || !response.paymentPageUrl ||
      response.conversationId !== input.id ||
      !verifyIyzicoSignature(secretKey, [response.conversationId, response.token], response.signature)) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'iyzico checkout could not be initialized or verified');
    }
    let page: URL;
    try { page = new URL(response.paymentPageUrl); }
    catch { throw new AppException(ErrorCode.FINANCE_INVALID, 'iyzico returned an invalid checkout URL'); }
    if (page.protocol !== 'https:' ||
      !['sandbox-api.iyzipay.com', 'sandbox-cpp.iyzipay.com'].includes(page.hostname)) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'iyzico returned an invalid checkout URL');
    }
    return { token: response.token, paymentPageUrl: page.toString() };
  }

  async verifyCheckout(token: string, input: Pick<CheckoutInput, 'id' | 'amountKurus'>): Promise<VerifiedPayment> {
    const response = await this.post(RETRIEVE, { locale: 'tr', conversationId: input.id, token });
    const { secretKey } = this.credentials();
    if (response.status !== 'success' || response.conversationId !== input.id || response.token !== token ||
      response.basketId !== input.id || response.currency !== 'TRY' ||
      Math.round(Number(response.paidPrice) * 100) !== input.amountKurus ||
      Math.round(Number(response.price) * 100) !== input.amountKurus ||
      !verifyIyzicoSignature(secretKey, [response.paymentStatus, response.paymentId, response.currency,
        response.basketId, response.conversationId, response.paidPrice, response.price, response.token], response.signature)) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'iyzico payment result could not be verified');
    }
    return {
      status: response.paymentStatus === 'SUCCESS'
        ? (response.fraudStatus === 1 ? 'succeeded' : 'pending')
        : 'failed',
      providerPaymentId: response.paymentId ?? null,
    };
  }

  private async post(path: string, payload: object): Promise<IyzicoResponse> {
    const { apiKey, secretKey } = this.credentials();
    const body = JSON.stringify(payload);
    const nonce = randomUUID();
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: iyzicoAuthorization(apiKey, secretKey, nonce, path, body),
          'x-iyzi-rnd': nonce,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'iyzico sandbox is unavailable');
    }
    if (!response.ok) throw new AppException(ErrorCode.FINANCE_INVALID, `iyzico sandbox returned HTTP ${response.status}`);
    try { return await response.json() as IyzicoResponse; }
    catch { throw new AppException(ErrorCode.FINANCE_INVALID, 'iyzico returned an invalid response'); }
  }
}
