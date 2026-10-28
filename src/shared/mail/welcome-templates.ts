import { ProductModule } from '../authorization/constants';

/** Modules whose owner welcome mail is built here; gym keeps its own `sendWelcomeGymOwner`. */
export type WelcomeModule = Exclude<ProductModule, 'gym'>;

interface ModuleWelcomeContent {
  brand: string;
  badge: string;
  heading: string;
  /** Fallback salutation when the owner gave no name. */
  recipientFallback: string;
  /** "…<tenant> <tenantNoun> için <brand> hesabınız…" */
  tenantNoun: string;
  tenantLabel: string;
  steps: Array<{ title: string; text: string }>;
}

export const MODULE_WELCOME_CONTENT: Record<WelcomeModule, ModuleWelcomeContent> = {
  vet: {
    brand: 'Odivon Vet',
    badge: 'VETERİNER KLİNİK YÖNETİM PLATFORMU',
    heading: 'Aramıza Hoş Geldiniz! 🐾',
    recipientFallback: 'Klinik Yöneticisi',
    tenantNoun: 'kliniğiniz',
    tenantLabel: 'Klinik Adı',
    steps: [
      { title: 'Klinik ve Tanımlar', text: 'Şubenizi, kasalarınızı ve hizmet tanımlarınızı oluşturun.' },
      { title: 'Müşteri ve Hasta Kayıtları', text: 'Hasta sahiplerini ve hastalarınızı ekleyip muayene geçmişini tek yerde tutun.' },
      { title: 'Randevu Takvimi', text: 'Randevularınızı planlayın, muayene ve tahsilatı aynı akışta tamamlayın.' },
    ],
  },
  farm: {
    brand: 'OdivonFARM',
    badge: 'ÇİFTLİK YÖNETİM PLATFORMU',
    heading: 'Aramıza Hoş Geldiniz! 🐄',
    recipientFallback: 'Çiftlik Yöneticisi',
    tenantNoun: 'çiftliğiniz',
    tenantLabel: 'Çiftlik Adı',
    steps: [
      { title: 'Çiftlik Ayarları', text: 'Çiftlik bilgilerinizi ve iletişim ayarlarınızı tamamlayın.' },
      { title: 'Hayvan Kayıtları', text: 'Sürünüzü sisteme ekleyip kayıtlarını tek yerden takip edin.' },
      { title: 'Ekip Üyeleri', text: 'Veteriner, saha ve muhasebe ekibinizi rolleriyle birlikte davet edin.' },
    ],
  },
  spa: {
    brand: 'OdivonSPA',
    badge: 'SPA & WELLNESS YÖNETİM PLATFORMU',
    heading: 'Aramıza Hoş Geldiniz! 🌿',
    recipientFallback: 'Spa Yöneticisi',
    tenantNoun: 'spa merkeziniz',
    tenantLabel: 'İşletme Adı',
    steps: [
      { title: 'Hizmet Kataloğu', text: 'Masaj, bakım ve diğer hizmetlerinizi süre ve fiyatlarıyla tanımlayın.' },
      { title: 'Ekip', text: 'Resepsiyon ve terapist ekibinizi davet edip yetkilerini belirleyin.' },
      { title: 'Randevu ve Paketler', text: 'Randevuları planlayın, paket satışlarını ve kasayı tek ekrandan yönetin.' },
    ],
  },
  hair: {
    brand: 'OdivonPro Hair',
    badge: 'KUAFÖR SALON YÖNETİM PLATFORMU',
    heading: 'Aramıza Hoş Geldiniz! ✂️',
    recipientFallback: 'Salon Yöneticisi',
    tenantNoun: 'salonunuz',
    tenantLabel: 'Salon Adı',
    steps: [
      { title: 'Hizmet Kataloğu', text: 'Kesim, boya ve bakım hizmetlerinizi süre ve fiyatlarıyla tanımlayın.' },
      { title: 'Ekip ve Çalışma Saatleri', text: 'Personelinizi ekleyip çalışma saatlerini belirleyin.' },
      { title: 'Online Randevu', text: 'Randevu sayfanızı müşterilerinizle paylaşın, takviminiz kendiliğinden dolsun.' },
    ],
  },
  beauty: {
    brand: 'Odivon Beauty',
    badge: 'GÜZELLİK MERKEZİ YÖNETİM PLATFORMU',
    heading: 'Aramıza Hoş Geldiniz! 💆‍♀️',
    recipientFallback: 'Merkez Yöneticisi',
    tenantNoun: 'güzellik merkeziniz',
    tenantLabel: 'Merkez Adı',
    steps: [
      { title: 'Kurulum', text: 'Merkezinizin temel bilgilerini girerek kurulumu tamamlayın.' },
      { title: 'Hizmetler ve Kaynaklar', text: 'Hizmetlerinizi, uzmanlarınızı ve odalarınızı tanımlayın.' },
      { title: 'Randevu ve Tahsilat', text: 'Randevuları planlayın, ödemeleri ve raporları tek yerden takip edin.' },
    ],
  },
  apm: {
    brand: 'Odivon APM',
    badge: 'RANDEVU YÖNETİM PLATFORMU',
    heading: 'Aramıza Hoş Geldiniz! 📅',
    recipientFallback: 'İşletme Yöneticisi',
    tenantNoun: 'işletmeniz',
    tenantLabel: 'İşletme Adı',
    steps: [
      { title: 'İlk Randevu', text: 'İlk randevunuzu oluşturarak takviminizi kullanmaya başlayın.' },
      { title: 'Takvim Takibi', text: 'Günlük ve haftalık randevularınızı tek ekrandan izleyin.' },
      { title: 'Paketler', text: 'Deneme süreniz bitmeden size uygun paketi abonelik sayfasından seçin.' },
    ],
  },
  rentacar: {
    brand: 'Odivon Rent A Car',
    badge: 'OTO KİRALAMA VE FİLO YÖNETİM PLATFORMU',
    heading: 'Filonuz Dijitalleşmeye Hazır! 🚘',
    recipientFallback: 'Filo Yöneticisi',
    tenantNoun: 'işletmeniz',
    tenantLabel: 'Firma Adı',
    steps: [
      { title: 'Şube ve Filo', text: 'İlk şubenizi ve kiralanabilir araçlarınızı tanımlayın.' },
      { title: 'Tarifeler', text: 'Sezon, süre ve araç sınıfına göre fiyatlarınızı oluşturun.' },
      { title: 'Rezervasyon', text: 'Operasyon çizelgesinden ilk rezervasyonunuzu planlayın.' },
    ],
  },
  drivingschool: {
    brand: 'Odivon Driving School',
    badge: 'SÜRÜCÜ KURSU YÖNETİM PLATFORMU',
    heading: 'Kursunuz Dijitalleşmeye Hazır! 🚗',
    recipientFallback: 'Kurs Yöneticisi',
    tenantNoun: 'sürücü kursunuz',
    tenantLabel: 'Kurs Adı',
    steps: [
      { title: 'Kursiyerler', text: 'İlk kursiyerinizi kaydedip belge durumunu takip edin.' },
      { title: 'Eğitmen ve Araçlar', text: 'Eğitmenlerinizi ve eğitim araçlarınızı tanımlayın.' },
      { title: 'Ders Planı', text: 'Çakışmasız direksiyon dersleri planlayın.' },
    ],
  },
  parking: {
    brand: 'OdivonPark',
    badge: 'AKILLI OTOPARK YÖNETİM PLATFORMU',
    heading: 'Otoparkınız Dijitalleşmeye Hazır! 🅿️',
    recipientFallback: 'Otopark Yöneticisi',
    tenantNoun: 'otopark işletmeniz',
    tenantLabel: 'İşletme Adı',
    steps: [
      { title: 'Tesis ve Alanlar', text: 'İlk tesisinizi, bölgelerinizi ve kapasitenizi tanımlayın.' },
      { title: 'Tarifeler', text: 'Ücretsiz süreyi ve park ücret bantlarını oluşturun.' },
      { title: 'Canlı Operasyon', text: 'Giriş, tahsilat ve çıkış akışını tek ekrandan yönetin.' },
    ],
  },
  fgas: complianceWelcome('OdivonF-Gas', 'F-GAS UYUMLULUK PLATFORMU'),
  'machine-ce': complianceWelcome('OdivonMachineCE', 'MAKİNE CE UYUMLULUK PLATFORMU'),
  'food-label': complianceWelcome('OdivonFoodLabel', 'GIDA ETİKETİ UYUMLULUK PLATFORMU'),
  'product-safe': complianceWelcome('OdivonProductSafe', 'ÜRÜN GÜVENLİĞİ PLATFORMU'),
  'fire-safe': complianceWelcome('OdivonFireSafe', 'YANGIN GÜVENLİĞİ PLATFORMU'),
  'pay-fair': complianceWelcome('OdivonPayFair', 'ÜCRET ŞEFFAFLIĞI PLATFORMU'),
  'cargo-docs': complianceWelcome('OdivonCargoDocs', 'KARGO BELGE YÖNETİM PLATFORMU'),
  kids: complianceWelcome('OdivonKids', 'ÇOCUK ÜRÜNLERİ GÜVENLİĞİ PLATFORMU'),
  'cyber-ready': complianceWelcome('OdivonCyberReady', 'SİBER HAZIRLIK PLATFORMU'),
  diet: complianceWelcome('OdivonDiet', 'BESLENME YÖNETİM PLATFORMU'),
};

function complianceWelcome(brand: string, badge: string): ModuleWelcomeContent {
  return {
    brand,
    badge,
    heading: 'Uyum çalışma alanınız hazır! ✅',
    recipientFallback: 'İşletme Yöneticisi',
    tenantNoun: 'işletmeniz',
    tenantLabel: 'İşletme Adı',
    steps: [
      { title: 'Ekip', text: 'Kullanıcıları davet edip rol ve izinlerini belirleyin.' },
      { title: 'İlk Kayıt', text: 'İlk operasyon veya uyum kaydınızı oluşturun.' },
      { title: 'Kanıt ve Takip', text: 'Görevleri, kanıtları ve yaklaşan tarihleri tek yerden izleyin.' },
    ],
  };
}

export interface ModuleWelcomeInput {
  module: WelcomeModule;
  to: string;
  displayName?: string | null;
  tenantName: string;
  /** Shown as a "free trial" row when the sign-up flow starts one. */
  trialDays?: number | null;
  /** Panel address for the CTA button; the button is left out without one. */
  loginUrl?: string | null;
}

/** User-supplied values (names, tenant name, e-mail) must pass through this before entering the HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHttpUrl(value?: string | null): string | null {
  const url = value?.trim();
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export function buildModuleWelcomeEmail(input: ModuleWelcomeInput): { brand: string; subject: string; html: string } {
  const content = MODULE_WELCOME_CONTENT[input.module];
  const brand = content.brand;
  const rawTenantName = input.tenantName.replace(/[\r\n]+/g, ' ').trim();
  const recipientName = escapeHtml(input.displayName?.trim() || content.recipientFallback);
  const tenantName = escapeHtml(rawTenantName);
  const email = escapeHtml(input.to);
  const loginUrl = safeHttpUrl(input.loginUrl);
  const trialDays = input.trialDays && input.trialDays > 0 ? Math.floor(input.trialDays) : null;

  const subject = `${brand} Ailesine Hoş Geldiniz! 🚀 (${rawTenantName})`;

  const trialSentence = trialDays
    ? ` ${trialDays} günlük tam sürüm ücretsiz deneme süreniz an itibarıyla başladı!`
    : '';

  const trialRow = trialDays
    ? `
                      <tr>
                        <td style="padding: 6px 0; color: #94a3b8;">Deneme Süresi:</td>
                        <td style="padding: 6px 0; font-weight: 700; color: #10b981; text-align: right;">${trialDays} Gün (Kredi Kartı Gerekmez)</td>
                      </tr>`
    : '';

  const stepsHtml = content.steps
    .map(
      (step) =>
        `                <li><strong style="color: #cbd5e1;">${step.title}:</strong> ${step.text}</li>`,
    )
    .join('\n');

  const ctaHtml = loginUrl
    ? `
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(loginUrl)}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; padding: 14px 36px; border-radius: 12px; box-shadow: 0 10px 25px rgba(99,102,241,0.4); text-transform: uppercase; letter-spacing: 0.5px;">
                      Yönetim Paneline Giriş Yap →
                    </a>
                  </td>
                </tr>
              </table>
`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brand} Ailesine Hoş Geldiniz</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b1120; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0b1120; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">

          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%); padding: 36px 32px; text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="display: inline-block; background-color: rgba(255,255,255,0.2); padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #ffffff; margin-bottom: 12px;">
                      ${content.badge}
                    </div>
                    <h1 style="margin: 0; font-size: 26px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px; line-height: 1.2;">
                      ${content.heading}
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 36px 32px;">
              <p style="margin: 0 0 16px; font-size: 16px; font-weight: 700; color: #f8fafc;">
                Sayın ${recipientName},
              </p>
              <p style="margin: 0 0 24px; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                <strong style="color: #6366f1;">${tenantName}</strong> ${content.tenantNoun} için ${brand} hesabınız başarıyla oluşturuldu.${trialSentence}
              </p>

              <!-- Highlights Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; margin-bottom: 28px; padding: 20px;">
                <tr>
                  <td>
                    <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #818cf8; margin-bottom: 12px;">
                      HESAP DETAYLARI
                    </div>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size: 13px; color: #cbd5e1;">
                      <tr>
                        <td style="padding: 6px 0; color: #94a3b8;">${content.tenantLabel}:</td>
                        <td style="padding: 6px 0; font-weight: 700; color: #ffffff; text-align: right;">${tenantName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #94a3b8;">Yönetici E-posta:</td>
                        <td style="padding: 6px 0; font-weight: 700; color: #ffffff; text-align: right;">${email}</td>
                      </tr>${trialRow}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Steps Guide -->
              <div style="font-size: 13px; font-weight: 700; color: #f8fafc; margin-bottom: 12px;">
                Hemen Başlamak İçin 3 Kolay Adım:
              </div>
              <ul style="margin: 0 0 28px; padding-left: 20px; font-size: 13px; color: #94a3b8; line-height: 1.8;">
${stepsHtml}
              </ul>
${ctaHtml}
              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5; text-align: center;">
                Herhangi bir sorunuz olursa <a href="mailto:info@odivon.com" style="color: #818cf8; text-decoration: underline;">info@odivon.com</a> üzerinden bize 7/24 ulaşabilirsiniz.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #090d16; padding: 24px 32px; border-top: 1px solid #1e293b; text-align: center;">
              <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; color: #94a3b8;">
                © ${new Date().getFullYear()} ${brand} · Tüm Hakları Saklıdır.
              </p>
              <p style="margin: 0; font-size: 10px; color: #475569;">
                Bu e-posta ${brand} hesabınız oluşturulduğu için otomatik olarak gönderilmiştir.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  return { brand, subject, html };
}
