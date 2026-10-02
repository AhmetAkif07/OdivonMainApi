export type SmsProviderType =
  | 'netgsm'
  | 'iletimerkezi'
  | 'mutlucell'
  | 'verimor'
  | 'twilio'
  | 'simulator';

export interface SmsSendResult {
  success: boolean;
  batchId?: string;
  totalRequested: number;
  sentCount: number;
  failedCount: number;
  provider: string;
  message?: string;
  rawResponse?: unknown;
}

export interface SmsBalanceResult {
  success: boolean;
  balance: number;
  currency: 'CREDIT' | 'TL' | 'USD';
  message?: string;
}

export interface SmsProviderMetadata {
  id: SmsProviderType;
  name: string;
  description: string;
  protocol: string;
  fields: { key: string; label: string; placeholder: string; isSecret?: boolean }[];
  requiresHeader: boolean;
}

export const SMS_PROVIDERS: SmsProviderMetadata[] = [
  {
    id: 'netgsm',
    name: 'Netgsm',
    description: "Türkiye'nin en yaygın SMS operatörü. Resmi başlıklı SMS ve anlık bakiye sorgusu.",
    protocol: 'REST / XML API',
    requiresHeader: true,
    fields: [
      { key: 'usercode', label: 'Kullanıcı Kodu / Abone No', placeholder: 'Örn: 850303XXXX' },
      { key: 'password', label: 'API Şifresi', placeholder: 'Netgsm portal şifreniz', isSecret: true },
      { key: 'header', label: 'SMS Başlığı (Originator)', placeholder: 'Örn: ODIVON GYM' },
    ],
  },
  {
    id: 'iletimerkezi',
    name: 'İletiMerkezi',
    description: 'Hızlı JSON REST API, otomatik Türkçe karakter desteği ve canlı bakiye kontrolü.',
    protocol: 'JSON REST API (v1)',
    requiresHeader: true,
    fields: [
      { key: 'apiKey', label: 'API Anahtarı (Public Key)', placeholder: 'İletiMerkezi API Key' },
      { key: 'apiHash', label: 'Gizli Anahtar (Secret Hash)', placeholder: 'İletiMerkezi API Hash', isSecret: true },
      { key: 'sender', label: 'Gönderici Başlığı', placeholder: 'Örn: ODIVON GYM' },
    ],
  },
  {
    id: 'mutlucell',
    name: 'Mutlucell',
    description: 'Spor salonları ve perakende sektöründe yaygın kullanılan ekonomik SMS ağ geçidi.',
    protocol: 'HTTP XML API',
    requiresHeader: true,
    fields: [
      { key: 'username', label: 'Kullanıcı Adı', placeholder: 'Mutlucell kullanıcı adınız' },
      { key: 'password', label: 'Şifre', placeholder: 'Mutlucell şifreniz', isSecret: true },
      { key: 'originator', label: 'Başlık (Originator)', placeholder: 'Örn: ODIVON' },
    ],
  },
  {
    id: 'verimor',
    name: 'Verimor Telekom',
    description: 'Kurumsal telekom altyapısı, yüksek teslimat hızı ve detaylı webhook raporlaması.',
    protocol: 'REST JSON API (v2)',
    requiresHeader: true,
    fields: [
      { key: 'username', label: 'Kullanıcı Adı', placeholder: 'Verimor kullanıcı adınız' },
      { key: 'password', label: 'Şifre', placeholder: 'Verimor şifreniz', isSecret: true },
      { key: 'header', label: 'Gönderici Başlığı', placeholder: 'Örn: ODIVONGYM' },
    ],
  },
  {
    id: 'twilio',
    name: 'Twilio',
    description: 'Yabancı üyeler, uluslararası SMS gönderimleri ve global telefon numarası desteği.',
    protocol: 'REST API (Global)',
    requiresHeader: false,
    fields: [
      { key: 'accountSid', label: 'Account SID', placeholder: 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' },
      { key: 'authToken', label: 'Auth Token', placeholder: 'Twilio Auth Token', isSecret: true },
      { key: 'fromNumber', label: 'Gönderici Numarası (E.164)', placeholder: '+1234567890' },
    ],
  },
  {
    id: 'simulator',
    name: 'Geliştirici / Simülatör Modu',
    description: 'Bakiye harcamadan panel üzerinde test ve geliştirme yapma simülasyonu.',
    protocol: 'Bellek İçi Simülatör',
    requiresHeader: false,
    fields: [],
  },
];
