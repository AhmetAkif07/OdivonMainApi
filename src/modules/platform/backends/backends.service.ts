import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import {
  BACKEND_ID_PATTERN,
  BackendCheck,
  BackendHealth,
  DEFAULT_BACKENDS,
  PlatformBackend,
  RemoteTenantList,
  TenantSummary,
  WebCheck,
} from './backend.types';
import { RemoteTenantStatusDto, UpsertBackendDto } from './dto';

const TIMEOUT_MS = 6000;
/** Bu süreden yavaş yanıt veren API "yavaş" (degraded) sayılır. */
const SLOW_MS = 2500;

type FetchLike = typeof fetch;

/** `PLATFORM_BACKEND_TOKENS` = {"erp":"<token>"} — harici API'lerin servis tokenları. */
export function parseBackendTokens(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0),
    );
  } catch {
    return {};
  }
}

export function healthFromResponse(httpStatus: number, latencyMs: number): BackendHealth {
  if (httpStatus >= 500 || httpStatus === 0) return 'down';
  if (httpStatus >= 400) return 'degraded';
  return latencyMs > SLOW_MS ? 'degraded' : 'up';
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v.slice(0, 80) : null);
const errText = (e: unknown): string =>
  e instanceof Error ? (e.name === 'TimeoutError' || e.name === 'AbortError' ? 'Zaman aşımı' : e.message.slice(0, 200)) : 'Bilinmeyen hata';

@Injectable()
export class PlatformBackendsService {
  private readonly logger = new Logger(PlatformBackendsService.name);
  /** Testlerde değiştirilebilir. */
  fetchImpl: FetchLike = (...args) => fetch(...args);
  tokens: () => Record<string, string> = () => parseBackendTokens(process.env['PLATFORM_BACKEND_TOKENS']);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly audit: PlatformAuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(ROOT_COLLECTION.platformBackends);
  }

  /** Varsayılanlar + Firestore'daki değişiklikler/eklemeler. */
  async listRegistry(): Promise<PlatformBackend[]> {
    const snap = await this.collection().get();
    const stored = new Map<string, Partial<PlatformBackend>>();
    snap.docs.forEach((d) => stored.set(d.id, d.data() as Partial<PlatformBackend>));
    const result: PlatformBackend[] = DEFAULT_BACKENDS.map((seed) => ({
      ...seed,
      enabled: true,
      notes: null,
      updatedAt: null,
      updatedBy: null,
      ...(stored.get(seed.id) ?? {}),
      id: seed.id,
      builtIn: true,
    }));
    for (const [id, data] of stored) {
      if (DEFAULT_BACKENDS.some((s) => s.id === id)) continue;
      result.push({
        name: id,
        description: null,
        products: [],
        apiUrl: null,
        healthUrl: null,
        webUrl: null,
        firebaseProjectId: null,
        tenantSource: 'none',
        tenantsUrl: null,
        enabled: true,
        notes: null,
        updatedAt: null,
        updatedBy: null,
        ...data,
        id,
        builtIn: false,
      });
    }
    return result;
  }

  async get(id: string): Promise<PlatformBackend> {
    const backend = (await this.listRegistry()).find((b) => b.id === id);
    if (!backend) throw new AppException(ErrorCode.VALIDATION_ERROR, 'Altyapı kaydı bulunamadı');
    return backend;
  }

  /** Tüm kayıtlar + canlı kontrol (paralel). Sonuç `lastCheck` olarak saklanır. */
  async overview(): Promise<{ items: PlatformBackend[]; tokenConfigured: Record<string, boolean>; checkedAt: string }> {
    const registry = await this.listRegistry();
    const tokens = this.tokens();
    const items = await Promise.all(
      registry.map(async (b) => {
        if (!b.enabled) return b;
        const check = await this.check(b);
        const patch: Partial<PlatformBackend> = { lastCheck: check };
        if (check.status === 'up' || check.status === 'degraded') patch.lastUpAt = check.checkedAt;
        if (check.status === 'down') patch.lastDownAt = check.checkedAt;
        await this.collection()
          .doc(b.id)
          .set(patch, { merge: true })
          .catch((e: unknown) => this.logger.warn(`lastCheck yazılamadı (${b.id}): ${errText(e)}`));
        return { ...b, ...patch };
      }),
    );
    return {
      items,
      tokenConfigured: Object.fromEntries(registry.map((b) => [b.id, Boolean(tokens[b.id])])),
      checkedAt: new Date().toISOString(),
    };
  }

  async check(b: PlatformBackend): Promise<BackendCheck> {
    const checkedAt = new Date().toISOString();
    const [api, web, tenants] = await Promise.all([
      b.tenantSource === 'main' ? this.selfCheck() : this.ping(b.healthUrl),
      b.webUrl ? this.webCheck(b.webUrl) : Promise.resolve(null),
      b.tenantSource === 'remote' && b.tenantsUrl
        ? this.fetchRemoteTenants(b).then(
            (r) => ({ summary: r.summary as TenantSummary | null, error: null as string | null }),
            (e: unknown) => ({ summary: null, error: e instanceof AppException ? e.message : errText(e) }),
          )
        : Promise.resolve({ summary: null, error: null }),
    ]);
    return { ...api, checkedAt, web, tenants: tenants.summary, tenantsError: tenants.error };
  }

  /** Bu API kendini dış adresinden çağırmaz (Worker döngüsü); Firestore bağlantısını ölçer. */
  private async selfCheck(): Promise<Omit<BackendCheck, 'checkedAt' | 'web' | 'tenants' | 'tenantsError'>> {
    const started = Date.now();
    try {
      await this.firebase.db.listCollections();
      const latencyMs = Date.now() - started;
      return {
        status: healthFromResponse(200, latencyMs),
        httpStatus: 200,
        latencyMs,
        version: str(process.env['APP_VERSION']),
        revision: str(process.env['GIT_COMMIT']),
        error: null,
      };
    } catch (e) {
      return { status: 'down', httpStatus: null, latencyMs: Date.now() - started, version: null, revision: null, error: errText(e) };
    }
  }

  private async ping(url: string | null): Promise<Omit<BackendCheck, 'checkedAt' | 'web' | 'tenants' | 'tenantsError'>> {
    if (!url) return { status: 'unknown', httpStatus: null, latencyMs: null, version: null, revision: null, error: null };
    const started = Date.now();
    try {
      const res = await this.fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json, text/html;q=0.8', 'user-agent': 'odivon-management-health/1' },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const latencyMs = Date.now() - started;
      let body: Record<string, unknown> = {};
      if ((res.headers.get('content-type') ?? '').includes('json')) body = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
      else await res.body?.cancel().catch(() => undefined);
      return {
        status: healthFromResponse(res.status, latencyMs),
        httpStatus: res.status,
        latencyMs,
        version: str(body['version']) ?? str(body['release']),
        revision: str(body['revision']) ?? str(body['commit']),
        error: res.ok ? null : `HTTP ${res.status}`,
      };
    } catch (e) {
      return { status: 'down', httpStatus: null, latencyMs: Date.now() - started, version: null, revision: null, error: errText(e) };
    }
  }

  private async webCheck(webUrl: string): Promise<WebCheck> {
    try {
      const res = await this.fetchImpl(`${webUrl.replace(/\/+$/, '')}/version.json`, {
        headers: { accept: 'application/json', 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = res.ok ? (((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>) : {};
      return {
        status: res.ok ? 'up' : res.status >= 500 ? 'down' : 'degraded',
        httpStatus: res.status,
        release: str(body['release']) ?? (typeof body['release'] === 'number' ? String(body['release']) : null),
        version: str(body['version']),
        buildId: str(body['buildId']),
        error: res.ok ? null : `HTTP ${res.status}`,
      };
    } catch (e) {
      return { status: 'down', httpStatus: null, release: null, version: null, buildId: null, error: errText(e) };
    }
  }

  private token(b: PlatformBackend): string {
    const token = this.tokens()[b.id];
    if (!token) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        `PLATFORM_BACKEND_TOKENS içinde "${b.id}" tokenı tanımlı değil`,
      );
    }
    return token;
  }

  async fetchRemoteTenants(b: PlatformBackend): Promise<RemoteTenantList> {
    if (b.tenantSource !== 'remote' || !b.tenantsUrl) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Bu altyapı için harici kiracı listesi tanımlı değil');
    }
    const res = await this.fetchImpl(b.tenantsUrl, {
      headers: { authorization: `Bearer ${this.token(b)}`, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS * 2),
    });
    if (!res.ok) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, `Harici API kiracı listesini vermedi (HTTP ${res.status})`);
    }
    const body = (await res.json()) as RemoteTenantList;
    if (!body || !Array.isArray(body.items) || !body.summary) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Harici API beklenmeyen yanıt verdi');
    }
    return body;
  }

  async remoteTenants(id: string): Promise<RemoteTenantList & { backend: PlatformBackend }> {
    const backend = await this.get(id);
    return { ...(await this.fetchRemoteTenants(backend)), backend };
  }

  async setRemoteTenantStatus(id: string, tenantId: string, dto: RemoteTenantStatusDto, admin: PlatformAdminUser) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(tenantId)) throw new AppException(ErrorCode.VALIDATION_ERROR, 'Geçersiz kiracı kimliği');
    const backend = await this.get(id);
    if (backend.tenantSource !== 'remote' || !backend.tenantsUrl) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Bu altyapı için harici kiracı yönetimi tanımlı değil');
    }
    const res = await this.fetchImpl(`${backend.tenantsUrl.replace(/\/+$/, '')}/${encodeURIComponent(tenantId)}/status`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token(backend)}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ status: dto.status, reason: dto.reason ?? null }),
      signal: AbortSignal.timeout(TIMEOUT_MS * 2),
    });
    if (res.status === 404) throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'Kiracı harici API\'de bulunamadı');
    if (!res.ok) throw new AppException(ErrorCode.VALIDATION_ERROR, `Harici API durumu değiştirmedi (HTTP ${res.status})`);
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'backend.tenant.status',
      targetType: 'backend',
      targetId: `${backend.id}/${tenantId}`,
      after: { status: dto.status },
      reason: dto.reason ?? null,
    });
    return { backendId: backend.id, tenantId, status: dto.status };
  }

  async upsert(id: string, dto: UpsertBackendDto, admin: PlatformAdminUser): Promise<PlatformBackend> {
    if (!BACKEND_ID_PATTERN.test(id)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Kimlik küçük harf, rakam ve tire olmalı (2-40 karakter)');
    }
    const nil = (v: string | null | undefined) => (v === undefined ? undefined : v === '' ? null : v);
    const patch: Record<string, unknown> = {
      name: dto.name.trim(),
      description: nil(dto.description),
      products: dto.products?.map((p) => p.trim()).filter(Boolean),
      apiUrl: nil(dto.apiUrl),
      healthUrl: nil(dto.healthUrl),
      webUrl: nil(dto.webUrl),
      firebaseProjectId: nil(dto.firebaseProjectId),
      tenantSource: dto.tenantSource,
      tenantsUrl: nil(dto.tenantsUrl),
      enabled: dto.enabled,
      notes: nil(dto.notes),
      updatedAt: new Date().toISOString(),
      updatedBy: admin.email,
    };
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
    const before = (await this.listRegistry()).find((b) => b.id === id) ?? null;
    await this.collection().doc(id).set(patch, { merge: true });
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: before ? 'backend.update' : 'backend.create',
      targetType: 'backend',
      targetId: id,
      before: before ? { name: before.name, apiUrl: before.apiUrl, healthUrl: before.healthUrl, tenantsUrl: before.tenantsUrl } : null,
      after: patch,
    });
    return this.get(id);
  }

  /** Eklenen kaydı siler; varsayılan kaydı varsayılan değerlerine döndürür. */
  async remove(id: string, admin: PlatformAdminUser): Promise<{ success: boolean; reset: boolean }> {
    const backend = await this.get(id);
    await this.collection().doc(id).delete();
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: backend.builtIn ? 'backend.reset' : 'backend.delete',
      targetType: 'backend',
      targetId: id,
      before: { name: backend.name },
    });
    return { success: true, reset: backend.builtIn };
  }
}
