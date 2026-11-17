import { leadContact } from '../ai-research/lead-fields';

type Doc = Record<string, any>;

/**
 * Lead skoru ve "sıradaki adım" önerisi. Kural tabanlıdır (AI çağrısı yok, ücretsiz ve anlık):
 * runner'ın sınıflandırması (öncelik, Odivon uyumu), ulaşılabilirlik, huni aşaması ve e-posta
 * etkileşimi (açma/tıklama) puanlanır. Bugünün listesi bu skora göre sıralanır.
 */

export type LeadTemperature = 'hot' | 'warm' | 'cold';
export type NextActionType = 'call' | 'whatsapp' | 'email' | 'sms' | 'find_contact' | 'wait';

export interface NextAction {
  type: NextActionType;
  /** Gönderilecek mesaj türü (call/find_contact/wait için null). */
  kind: 'offer' | 'followup' | 'ad' | 'info' | null;
  label: string;
  reason: string;
  /** Önerilen zaman (ISO). Geçmişte ise "şimdi". */
  dueAt: string;
}

export interface LeadScore {
  score: number;
  temperature: LeadTemperature;
  factors: string[];
  nextAction: NextAction | null;
}

const DAY_MS = 86_400_000;
const CLOSED = new Set(['won', 'lost', 'ignored']);

function daysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : (now - t) / DAY_MS;
}

/** İstanbul saatiyle hafta içi 10:00–18:00 ise şimdi; değilse bir sonraki iş günü 10:30. */
export function nextBusinessSlot(now: number): string {
  const offset = 3 * 3600_000; // Europe/Istanbul, yaz saati yok
  const local = new Date(now + offset);
  const day = local.getUTCDay();
  const hour = local.getUTCHours();
  if (day >= 1 && day <= 5 && hour >= 10 && hour < 18) return new Date(now).toISOString();
  const next = new Date(local);
  next.setUTCHours(10, 30, 0, 0);
  if (hour >= 18 || day === 0 || day === 6) next.setUTCDate(next.getUTCDate() + 1);
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) next.setUTCDate(next.getUTCDate() + 1);
  return new Date(next.getTime() - offset).toISOString();
}

export function scoreLead(lead: Doc, now = Date.now()): LeadScore {
  const p = lead.pipeline ?? {};
  const status: string = p.status ?? 'new';
  const contact = leadContact(lead);
  const factors: string[] = [];
  let score = 0;

  const priority = lead.insight?.priority;
  if (priority === 'sicak') {
    score += 30;
    factors.push('Sıcak lead');
  } else if (priority === 'ilik') {
    score += 18;
    factors.push('Ilık lead');
  } else if (priority === 'soguk') {
    score += 5;
  }
  const fit = Number(lead.insight?.odivonFit ?? 0);
  if (fit > 0) {
    score += Math.round(Math.min(fit, 3) * 7);
    if (fit >= 2) factors.push(`Odivon uyumu ${fit.toFixed(1)}/3`);
  }
  if ((lead.reviewCount ?? 0) >= 50) {
    score += 5;
    factors.push('Yerleşik işletme (50+ yorum)');
  }
  if (contact.mobile) score += 8;
  if (contact.email) score += 4;

  const stage: Record<string, number> = { new: 0, contacted: 4, replied: 22, demo: 28 };
  score += stage[status] ?? 0;
  if (status === 'replied') factors.push('Cevap verdi');
  if (status === 'demo') factors.push('Demo aşamasında');

  const clickedDays = daysSince(p.lastClickAt, now);
  const openedDays = daysSince(p.lastOpenAt, now);
  if (clickedDays !== null && clickedDays <= 7) {
    score += 15;
    factors.push('Son 7 günde teklife tıkladı');
  } else if (openedDays !== null && openedDays <= 7) {
    score += 7;
    factors.push('Son 7 günde e-postayı açtı');
  }
  if (p.demoRequestedAt) {
    score += 15;
    factors.push('Demo talep etti');
  }
  const offers = Number(p.offerCount ?? 0);
  if (offers >= 4 && status === 'contacted') {
    score -= 15;
    factors.push(`${offers} mesaja cevap yok`);
  }

  score = Math.max(0, Math.min(100, score));
  const temperature: LeadTemperature = score >= 65 ? 'hot' : score >= 40 ? 'warm' : 'cold';
  if (CLOSED.has(status) || p.optedOut) {
    return { score, temperature, factors, nextAction: null };
  }
  return { score, temperature, factors, nextAction: nextAction(lead, status, contact, now) };
}

function nextAction(
  lead: Doc,
  status: string,
  contact: ReturnType<typeof leadContact>,
  now: number,
): NextAction | null {
  const p = lead.pipeline ?? {};
  const slot = nextBusinessSlot(now);
  const msgChannel: NextActionType | null = contact.mobile ? 'whatsapp' : contact.email ? 'email' : null;
  const hasPhone = Boolean(lead.phone || contact.mobile);

  if (p.demoRequestedAt && status !== 'demo') {
    return { type: 'call', kind: null, label: 'Arayın: demo talebi var', reason: 'Teklifteki bağlantıdan demo istedi.', dueAt: slot };
  }
  const follow = p.nextFollowUpAt as string | undefined;
  if (follow && Date.parse(follow) <= now + DAY_MS) {
    const type = msgChannel ?? (hasPhone ? 'call' : 'find_contact');
    return {
      type,
      kind: type === 'call' || type === 'find_contact' ? null : 'followup',
      label: 'Planlanan takip',
      reason: 'Takip tarihi geldi.',
      dueAt: Date.parse(follow) < now ? new Date(now).toISOString() : follow,
    };
  }
  if (status === 'replied') {
    return hasPhone
      ? { type: 'call', kind: null, label: 'Arayın ve demo ayarlayın', reason: 'Cevap verdi; sıcakken telefonla görüşün.', dueAt: slot }
      : { type: msgChannel ?? 'find_contact', kind: 'info', label: 'Cevaplayın ve demo önerin', reason: 'Cevap verdi.', dueAt: slot };
  }
  if (status === 'demo') {
    const type = contact.email ? 'email' : (msgChannel ?? 'call');
    return { type, kind: type === 'call' ? null : 'offer', label: 'Fiyat teklifi gönderin', reason: 'Demo yapıldı; teklifle kapatın.', dueAt: slot };
  }
  const clicked = daysSince(p.lastClickAt, now);
  if (clicked !== null && clicked <= 3 && hasPhone) {
    return { type: 'call', kind: null, label: 'Hemen arayın', reason: 'Son 3 günde teklife tıkladı.', dueAt: slot };
  }
  if (status === 'new') {
    if (!msgChannel) {
      return hasPhone
        ? { type: 'call', kind: null, label: 'Arayın (cep/e-posta yok)', reason: 'Sadece sabit hat var.', dueAt: slot }
        : { type: 'find_contact', kind: null, label: 'İletişim bilgisi bulun', reason: 'Telefon ve e-posta yok.', dueAt: slot };
    }
    return {
      type: msgChannel,
      kind: 'offer',
      label: msgChannel === 'whatsapp' ? 'WhatsApp ile tanışma teklifi' : 'Broşür e-postası gönderin',
      reason: 'Henüz iletişime geçilmedi.',
      dueAt: slot,
    };
  }
  // contacted: cevap yoksa kanal değiştirerek takip.
  const last = daysSince(p.lastContactAt, now) ?? 99;
  const offers = Number(p.offerCount ?? 0);
  if (offers >= 4) {
    return { type: 'wait', kind: null, label: 'Bekletin', reason: `${offers} mesaja cevap yok; 30 gün sonra yeniden deneyin.`, dueAt: new Date(now + 30 * DAY_MS).toISOString() };
  }
  if (last < 3) {
    return { type: 'wait', kind: null, label: 'Cevap bekleniyor', reason: 'Son mesaj 3 günden yeni.', dueAt: new Date(Date.parse(p.lastContactAt) + 3 * DAY_MS).toISOString() };
  }
  const lastChannel = p.lastOfferChannel as string | undefined;
  const alt: NextActionType | null =
    lastChannel === 'whatsapp' && contact.email ? 'email' : lastChannel === 'email' && contact.mobile ? 'whatsapp' : msgChannel;
  if (!alt) return { type: hasPhone ? 'call' : 'find_contact', kind: null, label: 'Arayın', reason: 'Mesaja cevap yok.', dueAt: slot };
  return {
    type: last >= 7 && hasPhone ? 'call' : alt,
    kind: last >= 7 && hasPhone ? null : 'followup',
    label: last >= 7 && hasPhone ? 'Arayarak takip edin' : 'Takip mesajı gönderin',
    reason: `${Math.floor(last)} gündür cevap yok.`,
    dueAt: slot,
  };
}
