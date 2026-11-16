import { AI_LEAD_PRODUCTS } from './ai-research.config';

type Doc = Record<string, any>;

export interface LeadProducts {
  products: string[];
  /** Panelden atanmadı, sınıflandırmadan tahmin edildi (ör. runner "spor salonu" dedi → gym). */
  inferred: boolean;
}

/**
 * Lead'in ürün kategorisi. Panelden atanan liste (`pipeline.products`, boş liste dahil) her zaman
 * geçerlidir; hiç atanmamışsa runner'ın sınıflandırmasından tahmin edilir.
 */
export function leadProducts(d: Doc): LeadProducts {
  const assigned = d.pipeline?.products;
  if (Array.isArray(assigned)) {
    return { products: assigned.filter((p) => (AI_LEAD_PRODUCTS as readonly string[]).includes(p)), inferred: false };
  }
  if (d.insight?.isGym) return { products: ['gym'], inferred: true };
  return { products: [], inferred: false };
}

/** Panelde girilen e-posta önce, sonra runner'ın bulduğu adresler. */
export function leadEmail(d: Doc): string | null {
  const candidates = [
    d.pipeline?.contact?.email,
    d.email,
    d.enrichment?.email,
    ...(Array.isArray(d.enrichment?.emails) ? d.enrichment.emails : []),
  ];
  const found = candidates.find((e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()));
  return found ? String(found).trim().toLowerCase() : null;
}

/**
 * Türkiye numarasını E.164'e çevirir (`0532 123 45 67` → `+905321234567`). Tanınmayan biçim → null.
 */
export function normalizeTrPhone(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = String(raw).trim();
  let digits = value.replace(/\D/g, '');
  if (value.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith('90')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+9${digits}`;
  if (digits.length === 10 && !digits.startsWith('0')) return `+90${digits}`;
  if (value.startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** Türk cep numarası (+905xx…): SMS ve WhatsApp sadece bunlara gider. */
export function isTrMobile(e164: string | null): boolean {
  return Boolean(e164 && /^\+905\d{9}$/.test(e164));
}

/** WhatsApp/SMS için numara: panelde girilen WhatsApp numarası önce, sonra lead telefonu. */
export function leadMobile(d: Doc): string | null {
  for (const raw of [d.pipeline?.contact?.whatsapp, d.phone]) {
    const e164 = normalizeTrPhone(raw);
    if (isTrMobile(e164)) return e164;
  }
  return null;
}

export function leadContact(d: Doc) {
  return {
    contactName: d.pipeline?.contact?.contactName ?? null,
    email: leadEmail(d),
    whatsapp: d.pipeline?.contact?.whatsapp ?? null,
    mobile: leadMobile(d),
  };
}
