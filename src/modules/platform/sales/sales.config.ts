/** Satış & pazarlama: lead'lere teklif / reklam gönderimi ve takip. */

/** Gönderim kanalları. */
export const SALES_CHANNELS = ['email', 'whatsapp', 'sms'] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

/** Mesaj türü: fiyat teklifi, reklam/kampanya duyurusu, takip mesajı, bilgilendirme. */
export const SALES_OFFER_KINDS = ['offer', 'ad', 'followup', 'info'] as const;
export type SalesOfferKind = (typeof SALES_OFFER_KINDS)[number];

/**
 * api = sağlayıcı üzerinden gönderildi; manual = panel wa.me / sms: bağlantısı verdi, yönetici kendi
 * telefonundan gönderdi (sağlayıcı yapılandırılmamışken de çalışır).
 */
export const SALES_DELIVERY_MODES = ['api', 'manual'] as const;
export type SalesDeliveryMode = (typeof SALES_DELIVERY_MODES)[number];

/** sent → (accepted | rejected | expired). failed = sağlayıcı reddetti. */
export const SALES_OFFER_STATUSES = ['sent', 'failed', 'accepted', 'rejected', 'expired'] as const;
export type SalesOfferStatus = (typeof SALES_OFFER_STATUSES)[number];
export const SALES_OFFER_RESPONSE_STATUSES = ['sent', 'accepted', 'rejected', 'expired'] as const;

export const SALES_PRICE_PERIODS = ['monthly', 'yearly', 'once'] as const;
export type SalesPricePeriod = (typeof SALES_PRICE_PERIODS)[number];

/** Takip aktiviteleri; `followup` = hatırlatma (dueAt zorunlu). */
export const SALES_ACTIVITY_TYPES = ['note', 'call', 'meeting', 'demo', 'followup'] as const;
export type SalesActivityType = (typeof SALES_ACTIVITY_TYPES)[number];

/** Workers alt istek sınırı: bir gönderim adımında en fazla bu kadar lead. Panel adım adım çağırır. */
export const SALES_SEND_STEP_SIZE = 20;
