import { Injectable } from '@nestjs/common';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { IyzicoProvider } from './iyzico.provider';
import { decryptSecret, encryptSecret, maskKey } from './key-vault';
import { IyzicoCredentials } from './payment-provider';
import { SaveGymPaymentCredentialsDto, TestGymPaymentCredentialsDto } from './payments.dto';

/** Stored form: both keys encrypted, plus the masked hints shown to staff. */
interface StoredCredentials {
  provider: 'iyzico';
  enabled: boolean;
  mode: 'sandbox' | 'live';
  apiKeyEnc: string;
  secretKeyEnc: string;
  apiKeyHint: string;
  secretKeyHint: string;
  lastTest: { ok: boolean; message: string | null; at: string } | null;
  updatedAt: string;
  updatedBy: string;
}

export interface GymPaymentCredentialsView {
  provider: 'iyzico';
  configured: boolean;
  enabled: boolean;
  mode: 'sandbox' | 'live';
  apiKeyHint: string | null;
  secretKeyHint: string | null;
  lastTest: StoredCredentials['lastTest'];
  updatedAt: string | null;
}

/**
 * Each gym's own iyzico keys for member card payments (money goes to the gym's merchant account).
 * Keys are encrypted at rest and never returned; staff only see the last four characters.
 */
@Injectable()
export class GymPaymentCredentialsService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenant: TenantContext,
    private readonly iyzico: IyzicoProvider,
  ) {}

  private ref(tenantId = this.tenant.getTenantId()) {
    return this.firebase.db.doc(`tenants/${tenantId}/paymentSettings/iyzico`);
  }

  async view(): Promise<GymPaymentCredentialsView> {
    return toView((await this.ref().get()).data() as StoredCredentials | undefined);
  }

  /** New keys replace the stored ones; leaving them out keeps the stored keys (mode/enabled only). */
  async save(dto: SaveGymPaymentCredentialsDto): Promise<GymPaymentCredentialsView> {
    const current = (await this.ref().get()).data() as StoredCredentials | undefined;
    const apiKey = dto.apiKey?.trim();
    const secretKey = dto.secretKey?.trim();
    if (Boolean(apiKey) !== Boolean(secretKey)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Enter the API key and the secret key together');
    }
    if (!apiKey && !current) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'API key and secret key are required');
    }
    const next: StoredCredentials = {
      provider: 'iyzico',
      enabled: dto.enabled ?? current?.enabled ?? true,
      mode: dto.mode ?? current?.mode ?? 'sandbox',
      apiKeyEnc: apiKey ? encryptSecret(apiKey) : current!.apiKeyEnc,
      secretKeyEnc: secretKey ? encryptSecret(secretKey) : current!.secretKeyEnc,
      apiKeyHint: apiKey ? maskKey(apiKey) : current!.apiKeyHint,
      secretKeyHint: secretKey ? maskKey(secretKey) : current!.secretKeyHint,
      // A test result belongs to the keys and mode it was run with.
      lastTest: apiKey || (dto.mode && dto.mode !== current?.mode) ? null : (current?.lastTest ?? null),
      updatedAt: new Date().toISOString(),
      updatedBy: this.tenant.getUserId(),
    };
    await this.ref().set(next);
    return toView(next);
  }

  async remove(): Promise<GymPaymentCredentialsView> {
    await this.ref().delete();
    return toView(undefined);
  }

  /** "Bağlantıyı test et": the given (unsaved) keys, or the stored ones. No payment is made. */
  async test(dto: TestGymPaymentCredentialsDto) {
    const current = (await this.ref().get()).data() as StoredCredentials | undefined;
    let credentials: IyzicoCredentials;
    if (dto.apiKey?.trim() && dto.secretKey?.trim()) {
      credentials = { apiKey: dto.apiKey.trim(), secretKey: dto.secretKey.trim(), mode: dto.mode ?? current?.mode ?? 'sandbox' };
    } else if (current) {
      credentials = { ...decrypt(current), mode: dto.mode ?? current.mode };
    } else {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Enter the keys to test');
    }
    let result: { ok: boolean; message: string | null };
    try {
      result = await this.iyzico.testCredentials(credentials);
    } catch (error) {
      result = { ok: false, message: (error as Error).message };
    }
    const testedStored = current && !dto.apiKey && credentials.mode === current.mode;
    if (testedStored) await this.ref().update({ lastTest: { ...result, at: new Date().toISOString() } });
    return { ...result, mode: credentials.mode };
  }

  /** Decrypted keys for payments of a gym, or null when it has none (or switched them off). */
  async resolve(tenantId: string): Promise<IyzicoCredentials | null> {
    const stored = (await this.ref(tenantId).get()).data() as StoredCredentials | undefined;
    if (!stored?.enabled) return null;
    return { ...decrypt(stored), mode: stored.mode };
  }

  async isAvailable(tenantId = this.tenant.getTenantId()): Promise<boolean> {
    const stored = (await this.ref(tenantId).get()).data() as StoredCredentials | undefined;
    return Boolean(stored?.enabled && stored.apiKeyEnc && stored.secretKeyEnc);
  }
}

function decrypt(stored: StoredCredentials) {
  return { apiKey: decryptSecret(stored.apiKeyEnc), secretKey: decryptSecret(stored.secretKeyEnc) };
}

function toView(stored: StoredCredentials | undefined): GymPaymentCredentialsView {
  return {
    provider: 'iyzico',
    configured: Boolean(stored),
    enabled: stored?.enabled ?? false,
    mode: stored?.mode ?? 'sandbox',
    apiKeyHint: stored?.apiKeyHint ?? null,
    secretKeyHint: stored?.secretKeyHint ?? null,
    lastTest: stored?.lastTest ?? null,
    updatedAt: stored?.updatedAt ?? null,
  };
}
