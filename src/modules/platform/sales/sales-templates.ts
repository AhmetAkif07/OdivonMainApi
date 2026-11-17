import { escapeHtml, textToHtml, wrapEmailLayout } from '../crm/crm-templates';
import { SalesPricePeriod } from './sales.config';

export interface SalesTemplateVars {
  leadName?: string | null;
  contactName?: string | null;
  district?: string | null;
  city?: string | null;
  productLabel?: string | null;
  price?: { amount: number; currency?: string; period?: SalesPricePeriod; discountPercent?: number | null } | null;
  validUntil?: string | null;
  website?: string | null;
  phone?: string | null;
  /** Teklife özel demo talep sayfası (yoksa odivon.com). */
  demoUrl?: string | null;
}

const PERIOD_LABELS: Record<SalesPricePeriod, string> = { monthly: 'ay', yearly: 'yıl', once: 'tek seferlik' };

export function formatPrice(price: SalesTemplateVars['price']): string {
  if (!price || !Number.isFinite(price.amount)) return '';
  const currency = (price.currency || 'TRY').toUpperCase();
  const amount = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(price.amount);
  const symbol = currency === 'TRY' ? '₺' : currency;
  const period = price.period ? PERIOD_LABELS[price.period] : '';
  const base = `${amount} ${symbol}`;
  return price.period === 'once' || !period ? base : `${base} / ${period}`;
}

export function formatDateTr(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });
}

/** Panelde gösterilen yer tutucular (şablon editöründeki yardım listesi). */
export const SALES_PLACEHOLDERS = [
  { key: 'isletme', label: 'İşletme adı' },
  { key: 'ad', label: 'Yetkili adı (yoksa işletme adı)' },
  { key: 'ilce', label: 'İlçe' },
  { key: 'sehir', label: 'Şehir' },
  { key: 'urun', label: 'Ürün adı (ör. Spor Salonu)' },
  { key: 'fiyat', label: 'Teklif fiyatı (ör. 1.490 ₺ / ay)' },
  { key: 'indirim', label: 'İndirim oranı (ör. %20)' },
  { key: 'indirimli_fiyat', label: 'İndirim uygulanmış fiyat' },
  { key: 'gecerlilik', label: 'Teklif son geçerlilik tarihi' },
  { key: 'website', label: 'İşletmenin web sitesi' },
  { key: 'demo_linki', label: 'Demo talep bağlantısı (teklife özel)' },
] as const;

/** {{isletme}}, {{ad}}, {{ilce}}, {{sehir}}, {{urun}}, {{fiyat}}, {{indirim}}, {{gecerlilik}}, {{website}}. */
export function renderSalesText(template: string, vars: SalesTemplateVars, html = false): string {
  const discount = vars.price?.discountPercent;
  const values: Record<string, string> = {
    isletme: vars.leadName || '',
    ad: vars.contactName || vars.leadName || '',
    yetkili: vars.contactName || vars.leadName || '',
    ilce: vars.district || '',
    sehir: vars.city || '',
    urun: vars.productLabel || 'Odivon',
    fiyat: formatPrice(vars.price),
    indirimlifiyat: discount && vars.price ? formatPrice({ ...vars.price, amount: Math.round(vars.price.amount * (100 - discount)) / 100 }) : formatPrice(vars.price),
    indirim: discount ? `%${discount}` : '',
    gecerlilik: formatDateTr(vars.validUntil),
    website: vars.website || '',
    telefon: vars.phone || '',
    demolinki: vars.demoUrl || 'https://odivon.com',
  };
  return template.replace(/\{\{\s*([a-zA-ZçğıöşüÇĞİÖŞÜ_]+)\s*\}\}/g, (match, key: string) => {
    const normalized = key
      .toLocaleLowerCase('tr-TR')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ö/g, 'o')
      .replace(/ü/g, 'u')
      .replace(/_/g, '');
    const value = values[normalized];
    if (value === undefined) return match;
    return html ? escapeHtml(value) : value;
  });
}

export type SalesBodyFormat = 'text' | 'html';

/** HTML gövdeden düz metin (e-postanın text/plain kısmı). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * E-posta: `text` gövde paragraflara çevrilir; `html` gövde (broşür şablonları) olduğu gibi
 * kullanılır, yer tutucu değerleri HTML-escape edilir. İkisi de Odivon e-posta çerçevesine sarılır.
 */
export function renderSalesEmail(input: {
  subject: string;
  body: string;
  vars: SalesTemplateVars;
  bodyFormat?: SalesBodyFormat | null;
  ctaUrl?: string | null;
  ctaLabel?: string | null;
}) {
  const subject = renderSalesText(input.subject, input.vars);
  const isHtml = input.bodyFormat === 'html';
  const bodyHtml = isHtml ? renderSalesText(input.body, input.vars, true) : textToHtml(renderSalesText(input.body, input.vars));
  const text = isHtml ? htmlToText(bodyHtml) : renderSalesText(input.body, input.vars);
  const html = wrapEmailLayout({
    bodyHtml,
    preheader: subject,
    ctaUrl: input.ctaUrl ? renderSalesText(input.ctaUrl, input.vars) : null,
    ctaLabel: input.ctaLabel,
  });
  return { subject, text, html };
}

/** wa.me / sms: bağlantısı: sağlayıcı yokken yönetici kendi telefonundan gönderir. */
export function manualLink(channel: 'whatsapp' | 'sms', e164: string, text: string): string {
  const digits = e164.replace(/\D/g, '');
  return channel === 'whatsapp'
    ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
    : `sms:+${digits}?body=${encodeURIComponent(text)}`;
}
