import { SalesChannel, SalesOfferKind } from './sales.config';
import { SalesBodyFormat } from './sales-templates';

/**
 * Hazır satış şablonları: 5 ana ürün (GYM, Vet, Kuaför, Güzellik, Diyet) için broşür tarzı HTML
 * e-postalar ve WhatsApp / SMS mesajları. Kodda durur (id `lib:<ürün>:<tür>`); panelden doğrudan
 * kullanılabilir ya da "Kopyala" ile düzenlenebilir bir şablona (`salesTemplates`) dönüştürülür.
 *
 * Yer tutucular gönderimde lead'e göre dolar: {{isletme}}, {{ad}}, {{ilce}}, {{urun}}, {{fiyat}},
 * {{indirim}}, {{gecerlilik}}.
 */

export const LIBRARY_PREFIX = 'lib:';
export const LIBRARY_PRODUCTS = ['gym', 'vet', 'hair', 'beauty', 'diet'] as const;
export type LibraryProduct = (typeof LIBRARY_PRODUCTS)[number];

export interface LibraryTemplate {
  id: string;
  builtIn: true;
  name: string;
  description: string;
  channel: SalesChannel;
  kind: SalesOfferKind;
  product: LibraryProduct;
  subject: string;
  body: string;
  bodyFormat: SalesBodyFormat;
  ctaUrl: string | null;
  ctaLabel: string | null;
  price: { amount: number; currency: string; period: 'monthly' | 'yearly' | 'once'; discountPercent?: number } | null;
  /** Gönderimde geçerlilik tarihi verilmezse bugünden bu kadar gün sonrası kullanılır. */
  validDays: number | null;
  /**
   * Fiyat, gönderim anında Abonelik Fiyatları'ndan (platformSettings/saasPricing) bu paket ve ürün
   * için okunur; `price.amount` sadece fiyat bulunamazsa kullanılır.
   */
  pricePlan: { planId: string; cycle: 'monthly' | 'yearly' } | null;
  whatsappTemplate: null;
  active: true;
}

interface Feature {
  icon: string;
  title: string;
  text: string;
}

interface ProductPitch {
  key: LibraryProduct;
  /** Marka adı (ör. Odivon GYM). */
  brand: string;
  /** Hedef kitle, cümle içinde: "spor salonları". */
  audience: string;
  emoji: string;
  color: string;
  colorDark: string;
  soft: string;
  headline: string;
  subline: string;
  pain: string;
  features: Feature[];
  benefits: string[];
  /** Kampanya e-postasının başlığı. */
  adHeadline: string;
  waOffer: string;
  waFollowUp: string;
  smsAd: string;
  smsFollowUp: string;
  followUpEmail: string;
}

const PITCHES: ProductPitch[] = [
  {
    key: 'gym',
    brand: 'Odivon GYM',
    audience: 'spor salonları ve stüdyolar',
    emoji: '🏋️',
    color: '#059669',
    colorDark: '#047857',
    soft: '#ecfdf5',
    headline: 'Salonunuzu tek panelden yönetin',
    subline: 'Üyelik, paket, ders programı, giriş kontrolü ve tahsilat bir arada.',
    pain:
      'Üyelik bitişlerini defterden ya da Excel\'den takip etmek, tahsilatı WhatsApp\'tan hatırlatmak ve ders doluluğunu tahmin etmek hem zaman alıyor hem de üye kaybettiriyor.',
    features: [
      { icon: '👥', title: 'Üye ve paket yönetimi', text: 'Üyelik, dondurma, paket ve seans hakları otomatik düşer; bitişler önceden uyarır.' },
      { icon: '📅', title: 'Ders programı', text: 'Grup dersleri, PT seansları ve eğitmen takvimi; üyeler uygulamadan yer ayırır.' },
      { icon: '📱', title: 'Üye mobil uygulaması', text: 'Üyeleriniz programını, paketini ve ödemelerini telefonundan görür.' },
      { icon: '🔔', title: 'Otomatik hatırlatmalar', text: 'Üyelik bitişi, ödeme ve ders hatırlatmaları kendiliğinden gider.' },
      { icon: '💳', title: 'Tahsilat ve kasa', text: 'Taksit, borç ve günlük kasa takibi; kim ne ödedi tek ekranda.' },
      { icon: '📊', title: 'Raporlar', text: 'Aktif üye, kayıp üye, gelir ve doluluk raporlarıyla doğru karar.' },
    ],
    benefits: ['Kurulum ve veri aktarımında birebir destek', 'Şube ve personel yetkilendirmesi', 'Bulut tabanlı: her cihazdan erişim'],
    adHeadline: 'Yeni sezon üye kaydında Odivon GYM ile hazır olun',
    waOffer:
      'Merhaba {{ad}} 👋 Ben Odivon\'dan yazıyorum. {{isletme}} için üyelik, ders programı ve tahsilatı tek panelden yöneten Odivon GYM\'i tanıtmak istiyorum. Üyeleriniz mobil uygulamadan ders ayırabiliyor, üyelik bitişleri otomatik hatırlatılıyor.\n\nSize özel fiyat: {{fiyat}}\n\n10 dakikalık kısa bir demo için uygun olduğunuz bir saat var mı?',
    waFollowUp:
      'Merhaba {{ad}}, geçen gün Odivon GYM hakkında yazmıştım. Üyelik takibi ve tahsilat tarafında en çok zaman alan konu sizde hangisi? Size o kısmı 10 dakikada gösterebilirim 🙂',
    smsAd: '{{isletme}}: Üyelik, ders ve tahsilatı tek panelden yönetin. Odivon GYM {{fiyat}}. Demo: odivon.com',
    smsFollowUp: 'Merhaba {{ad}}, Odivon GYM teklifimiz {{gecerlilik}} tarihine kadar geçerli. Sorularınız için bize yazabilirsiniz. odivon.com',
    followUpEmail:
      'Merhaba {{ad}},\n\nGeçen hafta {{isletme}} için gönderdiğimiz Odivon GYM teklifini görme fırsatınız oldu mu?\n\nKısaca hatırlatmak isterim: üyelik bitişlerini otomatik takip etmek, dersleri uygulamadan doldurmak ve tahsilatı tek ekrandan görmek salonların her hafta saatlerce zaman kazanmasını sağlıyor.\n\nSize özel {{fiyat}} teklifimiz {{gecerlilik}} tarihine kadar geçerli. Uygun olduğunuz bir zamanı yazarsanız 15 dakikalık bir demo ayarlayalım.\n\nSevgiler,\nOdivon Ekibi',
  },
  {
    key: 'vet',
    brand: 'Odivon Vet',
    audience: 'veteriner klinikleri',
    emoji: '🐾',
    color: '#0284c7',
    colorDark: '#0369a1',
    soft: '#f0f9ff',
    headline: 'Kliniğinizin tüm iş akışı tek ekranda',
    subline: 'Hasta kartı, muayene, aşı takvimi, stok, pet otel ve kasa bir arada.',
    pain:
      'Aşı tarihlerini kaçırmak, hasta geçmişini kağıt dosyalarda aramak ve stok bitince fark etmek hem hastaya hem de kliniğe zaman kaybettiriyor.',
    features: [
      { icon: '📋', title: 'Hasta ve sahip kartı', text: 'Tür, ırk, kilo, alerji ve tüm muayene geçmişi tek dosyada.' },
      { icon: '💉', title: 'Aşı ve kontrol takvimi', text: 'Yaklaşan aşı ve kontroller için sahiplere otomatik hatırlatma.' },
      { icon: '🩺', title: 'Muayene ve tedavi', text: 'Muayene, reçete, ameliyat ve yatan hasta kayıtları hızlıca girilir.' },
      { icon: '🏨', title: 'Pet otel ve bakım', text: 'Konaklama, günlük bakım notları ve tıraş randevuları.' },
      { icon: '📦', title: 'Stok ve satın alma', text: 'İlaç ve mama stoğu, son kullanma ve kritik seviye uyarıları.' },
      { icon: '💰', title: 'Kasa ve cari', text: 'Tahsilat, borç takibi ve günlük gelir raporları.' },
    ],
    benefits: ['Mevcut hasta listenizi aktarmada destek', 'Çok şubeli klinik ve personel yetkileri', 'Randevu ve hatırlatmalarla daha az kaçan kontrol'],
    adHeadline: 'Aşı ve kontrol hatırlatmalarını Odivon Vet\'e bırakın',
    waOffer:
      'Merhaba {{ad}} 👋 Ben Odivon\'dan yazıyorum. {{isletme}} için hasta kartı, aşı takvimi, stok ve kasayı tek panelde toplayan Odivon Vet\'i tanıtmak istiyorum. Yaklaşan aşılar için sahiplere otomatik hatırlatma gidiyor.\n\nSize özel fiyat: {{fiyat}}\n\nKısa bir demo için uygun bir zamanınız var mı?',
    waFollowUp:
      'Merhaba {{ad}}, Odivon Vet hakkında yazmıştım. Klinikte en çok zaman alan iş aşı takibi mi, stok mu, yoksa kasa mı? O kısmı size 10 dakikada gösterebilirim 🐾',
    smsAd: '{{isletme}}: Hasta kartı, aşı takvimi, stok ve kasa tek panelde. Odivon Vet {{fiyat}}. Demo: odivon.com',
    smsFollowUp: 'Merhaba {{ad}}, Odivon Vet teklifimiz {{gecerlilik}} tarihine kadar geçerli. Demo için bize yazabilirsiniz. odivon.com',
    followUpEmail:
      'Merhaba {{ad}},\n\n{{isletme}} için gönderdiğimiz Odivon Vet teklifine göz atabildiniz mi?\n\nKliniklerin en çok faydalandığı kısım genelde aşı ve kontrol hatırlatmaları oluyor: sahipler zamanında geliyor, kaçan randevu azalıyor. Hasta geçmişi, stok ve kasa da aynı ekranda.\n\n{{fiyat}} teklifimiz {{gecerlilik}} tarihine kadar geçerli. Size uygun bir saat yazarsanız kısa bir demo yapalım.\n\nSevgiler,\nOdivon Ekibi',
  },
  {
    key: 'hair',
    brand: 'Odivon Kuaför',
    audience: 'kuaför ve berber salonları',
    emoji: '✂️',
    color: '#7c3aed',
    colorDark: '#6d28d9',
    soft: '#f5f3ff',
    headline: 'Randevularınız dolsun, telefonunuz sussun',
    subline: 'Online randevu, SMS hatırlatma, kasa, paket ve stok takibi.',
    pain:
      'Gün boyu telefonla randevu almak, gelmeyen müşteriler ve unutulan boya formülleri hem koltukları boş bırakıyor hem de ekibi yoruyor.',
    features: [
      { icon: '🗓️', title: '7/24 online randevu', text: 'Müşterileriniz size özel sayfadan uygun saati kendisi seçer.' },
      { icon: '💬', title: 'SMS hatırlatma', text: 'Randevu onayı ve hatırlatması otomatik gider, gelmeme azalır.' },
      { icon: '🎨', title: 'Müşteri kartı ve formüller', text: 'Boya formülü, tercih ve geçmiş işlemler her müşteride kayıtlı.' },
      { icon: '💈', title: 'Personel takvimi ve prim', text: 'Her uzmanın takvimi ayrı; prim ve performans raporu hazır.' },
      { icon: '🧾', title: 'Kasa ve paket satışı', text: 'Hizmet, ürün ve paket satışları; seans hakları otomatik düşer.' },
      { icon: '⏳', title: 'Bekleme listesi', text: 'İptal olan saatler bekleme listesindeki müşterilere teklif edilir.' },
    ],
    benefits: ['Salonunuza özel randevu bağlantısı', 'Ürün stoğu ve kritik seviye uyarısı', 'Kurulumda birebir destek'],
    adHeadline: 'Boş koltuk kalmasın: Odivon Kuaför ile online randevu',
    waOffer:
      'Merhaba {{ad}} 👋 Ben Odivon\'dan yazıyorum. {{isletme}} için online randevu sayfası, SMS hatırlatma, kasa ve müşteri kartlarını bir araya getiren Odivon Kuaför\'ü tanıtmak istiyorum. Müşterileriniz 7/24 randevu alabiliyor, gelmeme oranı düşüyor.\n\nSize özel fiyat: {{fiyat}}\n\nKısa bir demo için uygun bir zamanınız var mı?',
    waFollowUp:
      'Merhaba {{ad}}, Odivon Kuaför hakkında yazmıştım. Telefonla randevu almak sizde günde ne kadar sürüyor? Online randevu sayfanızı 10 dakikada birlikte kurabiliriz ✂️',
    smsAd: '{{isletme}}: Online randevu + SMS hatırlatma ile boş koltuk kalmasın. Odivon Kuaför {{fiyat}}. odivon.com',
    smsFollowUp: 'Merhaba {{ad}}, Odivon Kuaför teklifimiz {{gecerlilik}} tarihine kadar geçerli. Demo için bize yazın. odivon.com',
    followUpEmail:
      'Merhaba {{ad}},\n\n{{isletme}} için gönderdiğimiz Odivon Kuaför teklifini inceleme fırsatınız oldu mu?\n\nSalonların en çok sevdiği iki şey: müşterilerin 7/24 online randevu alabilmesi ve SMS hatırlatmalarla gelmeyen müşterinin azalması. Boya formülleri ve müşteri geçmişi de hep elinizin altında.\n\n{{fiyat}} teklifimiz {{gecerlilik}} tarihine kadar geçerli. Uygun bir saat yazarsanız randevu sayfanızı birlikte kuralım.\n\nSevgiler,\nOdivon Ekibi',
  },
  {
    key: 'beauty',
    brand: 'Odivon Güzellik',
    audience: 'güzellik merkezleri',
    emoji: '💅',
    color: '#db2777',
    colorDark: '#be185d',
    soft: '#fdf2f8',
    headline: 'WhatsApp\'tan randevu alan yapay zekâ asistanı',
    subline: 'AI randevu asistanı, online rezervasyon, seans paketleri ve müşteri takibi.',
    pain:
      'Mesai dışında gelen WhatsApp mesajlarına geç dönmek, seans paketlerini elle takip etmek ve unutulan randevular müşteri kaybına yol açıyor.',
    features: [
      { icon: '🤖', title: 'AI randevu asistanı', text: 'WhatsApp\'tan yazan müşteriye 7/24 cevap verir, uygun saate randevu oluşturur.' },
      { icon: '🗓️', title: 'Online rezervasyon', text: 'Hizmet, uzman ve saat seçerek müşteri kendi randevusunu alır.' },
      { icon: '🎟️', title: 'Seans paketleri', text: 'Lazer, cilt bakımı gibi paketlerde kalan seanslar otomatik düşer.' },
      { icon: '👩‍⚕️', title: 'Uzman takvimi', text: 'Her uzmanın ve cihazın takvimi ayrı, çakışma olmaz.' },
      { icon: '📇', title: 'Müşteri kartı', text: 'Uygulama geçmişi, notlar ve onam formları tek yerde.' },
      { icon: '📈', title: 'Gelir ve satış raporu', text: 'Hizmet, paket ve uzman bazında gelir takibi.' },
    ],
    benefits: ['Mesai dışında da randevu kaçmaz', 'Müşteri mobil erişimi', 'Kurulum ve WhatsApp bağlantısında destek'],
    adHeadline: 'Mesai bitse de randevu almaya devam edin',
    waOffer:
      'Merhaba {{ad}} 👋 Ben Odivon\'dan yazıyorum. {{isletme}} için WhatsApp\'tan gelen mesajlara 7/24 cevap verip randevu oluşturan yapay zekâ asistanını ve seans paketi takibini tanıtmak istiyorum.\n\nSize özel fiyat: {{fiyat}}\n\nAsistanı canlı denemek için 10 dakikalık bir demo ayarlayalım mı?',
    waFollowUp:
      'Merhaba {{ad}}, Odivon Güzellik\'in AI randevu asistanından bahsetmiştim. Akşamları ve hafta sonu gelen mesajlara dönmek sizde sorun oluyor mu? Asistanı size canlı gösterebilirim 💅',
    smsAd: '{{isletme}}: WhatsApp\'tan 7/24 randevu alan AI asistan + seans paketi takibi. Odivon Güzellik {{fiyat}}. odivon.com',
    smsFollowUp: 'Merhaba {{ad}}, Odivon Güzellik teklifimiz {{gecerlilik}} tarihine kadar geçerli. Canlı demo için bize yazın. odivon.com',
    followUpEmail:
      'Merhaba {{ad}},\n\n{{isletme}} için gönderdiğimiz Odivon Güzellik teklifine göz atabildiniz mi?\n\nGüzellik merkezlerinin en çok ilgisini çeken özellik, WhatsApp\'tan gelen mesajlara 7/24 cevap veren ve randevuyu kendisi oluşturan yapay zekâ asistanı. Seans paketleri ve uzman takvimi de aynı panelde.\n\n{{fiyat}} teklifimiz {{gecerlilik}} tarihine kadar geçerli. Asistanı canlı görmek için uygun bir saat yazmanız yeterli.\n\nSevgiler,\nOdivon Ekibi',
  },
  {
    key: 'diet',
    brand: 'Odivon Diyet',
    audience: 'diyetisyen ve beslenme danışmanları',
    emoji: '🥗',
    color: '#16a34a',
    colorDark: '#15803d',
    soft: '#f0fdf4',
    headline: 'Danışanlarınızı tek panelden takip edin',
    subline: 'Danışan kartı, ölçüm takibi, beslenme planı, randevu ve tahsilat.',
    pain:
      'Ölçümleri Excel\'de, diyet listelerini Word\'de, randevuları telefonda tutmak hem zaman alıyor hem de danışanın ilerlemesini görmeyi zorlaştırıyor.',
    features: [
      { icon: '📇', title: 'Danışan kartı', text: 'Sağlık geçmişi, alışkanlıklar, hedefler ve notlar tek dosyada.' },
      { icon: '📏', title: 'Ölçüm ve ilerleme', text: 'Kilo, yağ oranı ve çevre ölçümleri grafiklerle izlenir.' },
      { icon: '🍽️', title: 'Beslenme planları', text: 'Hazır şablonlardan hızlıca kişiye özel plan hazırlayın.' },
      { icon: '🗓️', title: 'Randevu ve online görüşme', text: 'Yüz yüze ve online seanslar tek takvimde, hatırlatmalar otomatik.' },
      { icon: '📲', title: 'Danışan erişimi', text: 'Danışan planını ve ilerlemesini telefonundan görür.' },
      { icon: '💳', title: 'Paket ve tahsilat', text: 'Seans paketleri, ödemeler ve kalan haklar otomatik takip edilir.' },
    ],
    benefits: ['Mevcut danışan listenizi aktarmada destek', 'Klinik ve online danışmanlık için uygun', 'Bulut tabanlı: her cihazdan erişim'],
    adHeadline: 'Danışan takibini Excel\'den kurtarın',
    waOffer:
      'Merhaba {{ad}} 👋 Ben Odivon\'dan yazıyorum. {{isletme}} için danışan kartı, ölçüm takibi, beslenme planı ve randevuları tek panelde toplayan Odivon Diyet\'i tanıtmak istiyorum.\n\nSize özel fiyat: {{fiyat}}\n\nKısa bir demo için uygun bir zamanınız var mı?',
    waFollowUp:
      'Merhaba {{ad}}, Odivon Diyet hakkında yazmıştım. Danışan ölçümlerini ve planları şu an nasıl takip ediyorsunuz? Size 10 dakikada nasıl kolaylaştığını gösterebilirim 🥗',
    smsAd: '{{isletme}}: Danışan, ölçüm, beslenme planı ve randevu tek panelde. Odivon Diyet {{fiyat}}. odivon.com',
    smsFollowUp: 'Merhaba {{ad}}, Odivon Diyet teklifimiz {{gecerlilik}} tarihine kadar geçerli. Demo için bize yazın. odivon.com',
    followUpEmail:
      'Merhaba {{ad}},\n\n{{isletme}} için gönderdiğimiz Odivon Diyet teklifini inceleyebildiniz mi?\n\nDiyetisyenlerin en çok zaman kazandığı yer ölçüm ve ilerleme takibi oluyor: danışanın tüm ölçümleri grafikte, planı ve randevusu aynı kartta.\n\n{{fiyat}} teklifimiz {{gecerlilik}} tarihine kadar geçerli. Uygun bir saat yazarsanız 15 dakikalık bir demo yapalım.\n\nSevgiler,\nOdivon Ekibi',
  },
];

// ------------------------------------------------------------------ HTML broşür

function featureCell(f: Feature, soft: string): string {
  return `<td width="50%" valign="top" style="padding:6px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${soft};border-radius:12px"><tr><td style="padding:14px 16px">
<div style="font-size:22px;line-height:1">${f.icon}</div>
<div style="font-weight:700;font-size:14px;margin:8px 0 4px;color:#0f172a">${f.title}</div>
<div style="font-size:13px;line-height:1.5;color:#475569">${f.text}</div>
</td></tr></table></td>`;
}

function featureGrid(p: ProductPitch): string {
  const rows: string[] = [];
  for (let i = 0; i < p.features.length; i += 2) {
    rows.push(`<tr>${featureCell(p.features[i], p.soft)}${p.features[i + 1] ? featureCell(p.features[i + 1], p.soft) : '<td></td>'}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px -6px">${rows.join('')}</table>`;
}

function hero(p: ProductPitch, title: string, subtitle: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${p.color};background:linear-gradient(135deg,${p.color},${p.colorDark});border-radius:14px;margin:0 0 20px">
<tr><td style="padding:26px 24px;color:#ffffff">
<div style="font-size:13px;font-weight:700;letter-spacing:.5px;opacity:.9">${p.emoji} ${p.brand}</div>
<div style="font-size:24px;line-height:1.25;font-weight:800;margin:8px 0 6px">${title}</div>
<div style="font-size:14px;line-height:1.5;opacity:.92">${subtitle}</div>
</td></tr></table>`;
}

function priceBox(p: ProductPitch, ad: boolean): string {
  const title = ad ? 'Kampanya fiyatı' : '{{isletme}} için özel teklif';
  const discount = ad ? `<div style="display:inline-block;background:#fef3c7;color:#92400e;font-weight:700;font-size:12px;padding:4px 10px;border-radius:999px;margin-bottom:8px">{{indirim}} indirim</div>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${p.color};border-radius:14px;margin:20px 0">
<tr><td style="padding:18px 20px;text-align:center">
${discount}
<div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b">${title}</div>
${ad ? `<div style="font-size:15px;color:#94a3b8;text-decoration:line-through;margin-top:6px">{{fiyat}}</div>` : ''}
<div style="font-size:30px;font-weight:800;color:${p.colorDark};margin:6px 0">${ad ? '{{indirimli_fiyat}}' : '{{fiyat}}'}</div>
<div style="font-size:12px;color:#64748b">Teklif {{gecerlilik}} tarihine kadar geçerlidir.</div>
</td></tr></table>`;
}

function benefitList(p: ProductPitch): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px">${p.benefits
    .map(
      (b) => `<tr><td width="26" valign="top" style="color:${p.color};font-weight:800;font-size:15px;padding:3px 0">✓</td><td style="font-size:14px;color:#334155;padding:3px 0">${b}</td></tr>`,
    )
    .join('')}</table>`;
}

function brochureOffer(p: ProductPitch): string {
  return [
    hero(p, p.headline, p.subline),
    `<p style="margin:0 0 14px">Merhaba {{ad}},</p>`,
    `<p style="margin:0 0 14px">${p.audience.charAt(0).toLocaleUpperCase('tr-TR') + p.audience.slice(1)} için geliştirdiğimiz ${p.brand} ile ilgili {{isletme}} için kısa bir tanıtım hazırladık.</p>`,
    `<p style="margin:0 0 18px;color:#475569">${p.pain}</p>`,
    `<div style="font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${p.colorDark};margin:4px 0 6px">Neler yapabilirsiniz?</div>`,
    featureGrid(p),
    `<div style="font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${p.colorDark};margin:18px 0 6px">Neden Odivon?</div>`,
    benefitList(p),
    priceBox(p, false),
    `<p style="margin:0 0 6px">15 dakikalık ücretsiz bir demo ile sistemi {{isletme}} üzerinden birlikte gösterelim. Bu e-postayı yanıtlamanız yeterli.</p>`,
    `<p style="margin:16px 0 0">Sevgiler,<br>Odivon Satış Ekibi</p>`,
  ].join('\n');
}

function brochureAd(p: ProductPitch): string {
  const top = p.features.slice(0, 4);
  return [
    hero(p, p.adHeadline, `${p.brand} ile ${p.audience} için kampanya`),
    `<p style="margin:0 0 14px">Merhaba {{ad}},</p>`,
    `<p style="margin:0 0 16px">Bu ay ${p.brand} kullanmaya başlayan işletmelere özel indirim uyguluyoruz. {{isletme}} için öne çıkan özellikler:</p>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${top
      .map(
        (f) => `<tr><td width="40" valign="top" style="font-size:22px;padding:6px 0">${f.icon}</td><td style="padding:6px 0"><div style="font-weight:700;font-size:14px">${f.title}</div><div style="font-size:13px;color:#475569">${f.text}</div></td></tr>`,
      )
      .join('')}</table>`,
    priceBox(p, true),
    `<p style="margin:0">Kampanyadan yararlanmak ya da demo istemek için bu e-postayı yanıtlayın.</p>`,
    `<p style="margin:16px 0 0">Sevgiler,<br>Odivon Satış Ekibi</p>`,
  ].join('\n');
}

// ------------------------------------------------------------------ katalog

const DEFAULT_PRICE = { amount: 1490, currency: 'TRY', period: 'monthly' as const };

function build(p: ProductPitch): LibraryTemplate[] {
  const base = { builtIn: true as const, product: p.key, whatsappTemplate: null, active: true as const };
  return [
    {
      ...base,
      id: `${LIBRARY_PREFIX}${p.key}:email-brochure`,
      name: `${p.brand} · Broşür teklif e-postası`,
      description: 'Ürün tanıtımı, 6 özellik kartı, fiyat kutusu ve demo çağrısı (HTML).',
      channel: 'email',
      kind: 'offer',
      subject: '{{isletme}} için ' + p.brand + ' teklifi',
      body: brochureOffer(p),
      bodyFormat: 'html',
      ctaUrl: '{{demo_linki}}',
      ctaLabel: 'Ücretsiz demo isteyin',
      price: { ...DEFAULT_PRICE },
      pricePlan: { planId: 'starter', cycle: 'monthly' },
      validDays: 14,
    },
    {
      ...base,
      id: `${LIBRARY_PREFIX}${p.key}:email-campaign`,
      name: `${p.brand} · Kampanya / reklam e-postası`,
      description: 'İndirim vurgulu kısa broşür (HTML).',
      channel: 'email',
      kind: 'ad',
      subject: `${p.emoji} {{indirim}} indirim: ${p.brand} {{isletme}} için`,
      body: brochureAd(p),
      bodyFormat: 'html',
      ctaUrl: '{{demo_linki}}',
      ctaLabel: 'Kampanyadan yararlan',
      price: { ...DEFAULT_PRICE, discountPercent: 20 },
      pricePlan: { planId: 'starter', cycle: 'monthly' },
      validDays: 10,
    },
    {
      ...base,
      id: `${LIBRARY_PREFIX}${p.key}:email-followup`,
      name: `${p.brand} · Takip e-postası`,
      description: 'Teklif gönderildikten 3-5 gün sonra kısa hatırlatma.',
      channel: 'email',
      kind: 'followup',
      subject: 'Re: {{isletme}} için ' + p.brand + ' teklifi',
      body: p.followUpEmail,
      bodyFormat: 'text',
      ctaUrl: null,
      ctaLabel: null,
      price: { ...DEFAULT_PRICE },
      pricePlan: { planId: 'starter', cycle: 'monthly' },
      validDays: 7,
    },
    {
      ...base,
      id: `${LIBRARY_PREFIX}${p.key}:whatsapp-offer`,
      name: `${p.brand} · WhatsApp ilk teklif`,
      description: 'Kısa tanıtım + fiyat + demo sorusu.',
      channel: 'whatsapp',
      kind: 'offer',
      subject: '',
      body: p.waOffer,
      bodyFormat: 'text',
      ctaUrl: null,
      ctaLabel: null,
      price: { ...DEFAULT_PRICE },
      pricePlan: { planId: 'starter', cycle: 'monthly' },
      validDays: 14,
    },
    {
      ...base,
      id: `${LIBRARY_PREFIX}${p.key}:whatsapp-followup`,
      name: `${p.brand} · WhatsApp takip`,
      description: 'Cevap gelmeyen lead için ihtiyaç sorusu.',
      channel: 'whatsapp',
      kind: 'followup',
      subject: '',
      body: p.waFollowUp,
      bodyFormat: 'text',
      ctaUrl: null,
      ctaLabel: null,
      price: null,
      pricePlan: null,
      validDays: null,
    },
    {
      ...base,
      id: `${LIBRARY_PREFIX}${p.key}:sms-campaign`,
      name: `${p.brand} · SMS kampanya`,
      description: 'Kısa reklam mesajı (Türkçe karakterli SMS, ~2 parça).',
      channel: 'sms',
      kind: 'ad',
      subject: '',
      body: p.smsAd,
      bodyFormat: 'text',
      ctaUrl: null,
      ctaLabel: null,
      price: { ...DEFAULT_PRICE },
      pricePlan: { planId: 'starter', cycle: 'monthly' },
      validDays: 10,
    },
    {
      ...base,
      id: `${LIBRARY_PREFIX}${p.key}:sms-followup`,
      name: `${p.brand} · SMS teklif hatırlatma`,
      description: 'Teklifin geçerlilik tarihini hatırlatır.',
      channel: 'sms',
      kind: 'followup',
      subject: '',
      body: p.smsFollowUp,
      bodyFormat: 'text',
      ctaUrl: null,
      ctaLabel: null,
      price: null,
      pricePlan: null,
      validDays: 7,
    },
  ];
}

export const SALES_TEMPLATE_LIBRARY: LibraryTemplate[] = PITCHES.flatMap(build);

export function isLibraryId(id: string | null | undefined): boolean {
  return Boolean(id && id.startsWith(LIBRARY_PREFIX));
}

export function findLibraryTemplate(id: string): LibraryTemplate | undefined {
  return SALES_TEMPLATE_LIBRARY.find((t) => t.id === id);
}

/** AI mesaj/reklam yazımında kullanılan ürün bilgileri (AI bunların dışında özellik uydurmaz). */
export function productFacts(product: string | null | undefined): string | null {
  const p = PITCHES.find((x) => x.key === product);
  if (!p) return null;
  return [
    `Marka: ${p.brand} (hedef: ${p.audience})`,
    `Ana mesaj: ${p.headline}`,
    `Sorun: ${p.pain}`,
    'Özellikler:',
    ...p.features.map((f) => `- ${f.title}: ${f.text}`),
    'Faydalar:',
    ...p.benefits.map((b) => `- ${b}`),
  ].join('\n');
}
