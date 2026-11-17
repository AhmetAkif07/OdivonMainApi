import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { normalizeTrPhone } from '../ai-research/lead-fields';

type Doc = Record<string, any>;

export type SuppressionReason = 'unsubscribe' | 'reply' | 'manual' | 'bounce' | 'complaint';

/**
 * Ret (gönderme) listesi ve teklif bağlantıları (açılma pikseli, tıklama, abonelikten çıkma, demo
 * talebi). Ret listesindeki e-posta/telefona hiçbir kanaldan mesaj gitmez. 6563 sayılı Kanun ve
 * İYS gereği alıcının ret hakkı her ticari iletide sunulur.
 */
@Injectable()
export class SalesConsentService {
  constructor(private readonly firebase: FirebaseService) {}

  private col() {
    return this.firebase.db.collection(ROOT_COLLECTION.salesSuppressions);
  }

  /** E-posta küçük harf, telefon E.164; doküman kimliği olarak da kullanılır. */
  static key(value: string): { type: 'email' | 'phone'; value: string; id: string } | null {
    const v = value.trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      const email = v.toLowerCase();
      return { type: 'email', value: email, id: `email:${email}` };
    }
    const phone = normalizeTrPhone(v);
    return phone ? { type: 'phone', value: phone, id: `phone:${phone}` } : null;
  }

  /** Verilen adreslerden ret listesinde olanlar. */
  async suppressed(values: (string | null | undefined)[]): Promise<Set<string>> {
    const keys = [...new Set(values.filter((v): v is string => Boolean(v)).map((v) => SalesConsentService.key(v)?.id).filter(Boolean))] as string[];
    if (!keys.length) return new Set();
    const snaps = await this.firebase.db.getAll(...keys.map((id) => this.col().doc(id)));
    const out = new Set<string>();
    for (const s of snaps) if (s.exists) out.add((s.data() as Doc).value);
    return out;
  }

  async list(q?: string) {
    const snap = await this.col().orderBy('createdAt', 'desc').limit(1000).get();
    const term = q?.trim().toLocaleLowerCase('tr-TR');
    return snap.docs
      .map((d) => d.data())
      .filter((d) => !term || `${d.value} ${d.leadName ?? ''} ${d.note ?? ''}`.toLocaleLowerCase('tr-TR').includes(term));
  }

  async add(
    input: { value: string; reason: SuppressionReason; leadId?: string | null; leadName?: string | null; note?: string | null; source: string },
    by: { uid: string; email: string | null } | null,
  ) {
    const key = SalesConsentService.key(input.value);
    if (!key) throw new AppException(ErrorCode.VALIDATION_ERROR, 'Geçerli bir e-posta ya da telefon girin');
    const now = new Date().toISOString();
    const doc = {
      id: key.id,
      type: key.type,
      value: key.value,
      reason: input.reason,
      leadId: input.leadId ?? null,
      leadName: input.leadName ?? null,
      note: input.note ?? null,
      source: input.source,
      createdAt: now,
      createdBy: by?.uid ?? null,
      createdByEmail: by?.email ?? null,
    };
    await this.col().doc(key.id).set(doc, { merge: true });
    return doc;
  }

  async remove(id: string) {
    const ref = this.col().doc(id);
    if (!(await ref.get()).exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Kayıt bulunamadı');
    await ref.delete();
    return { id, deleted: true };
  }

  static newToken(): string {
    return randomBytes(12).toString('base64url');
  }

  static publicBase(): string {
    return `${(process.env.PUBLIC_API_URL?.trim() || 'https://mainapi.odivon.com').replace(/\/+$/, '')}/api/v1/public/sales`;
  }

  static links(token: string) {
    const base = `${SalesConsentService.publicBase()}/o/${token}`;
    return { open: `${base}/p.gif`, click: (i: number) => `${base}/c/${i}`, unsubscribe: `${base}/u`, demo: `${base}/demo` };
  }
}

/**
 * E-posta HTML'ine izleme ekler: http(s) bağlantıları /c/:i üzerinden yönlenir (orijinal adresler
 * teklif kaydında `links` olarak saklanır, böylece açık yönlendirme yok), sona açılma pikseli ve
 * abonelikten çıkma satırı eklenir.
 */
export function instrumentEmail(html: string, text: string, token: string): { html: string; text: string; links: string[] } {
  const l = SalesConsentService.links(token);
  const links: string[] = [];
  const tracked = html.replace(/href="(https?:\/\/[^"]+)"/gi, (_match, url: string) => {
    const decoded = url.replace(/&amp;/g, '&');
    let i = links.indexOf(decoded);
    if (i === -1) {
      links.push(decoded);
      i = links.length - 1;
    }
    return `href="${l.click(i)}"`;
  });
  const footer =
    `<p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center">Bu e-postayı Odivon tanıtımları için aldınız. ` +
    `Almak istemiyorsanız <a href="${l.unsubscribe}" style="color:#64748b">buradan ayrılabilirsiniz</a>.</p>` +
    `<img src="${l.open}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px" />`;
  const withFooter = /<\/body>/i.test(tracked) ? tracked.replace(/<\/body>/i, `${footer}</body>`) : tracked + footer;
  return {
    html: withFooter,
    text: `${text}\n\n—\nBu e-postaları almak istemiyorsanız: ${l.unsubscribe}`,
    links,
  };
}
