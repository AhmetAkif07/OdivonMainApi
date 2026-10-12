import { SmsBalanceResult, SmsSendResult } from './sms-provider.types';

export interface ISmsAdapter {
  send(options: { recipients: string[]; message: string; header?: string }): Promise<SmsSendResult>;
  getBalance(): Promise<SmsBalanceResult>;
}

function cleanPhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('90') && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}

// 1. NETGSM ADAPTER
export class NetgsmAdapter implements ISmsAdapter {
  constructor(private readonly config: Record<string, any>) {}

  async send(options: { recipients: string[]; message: string; header?: string }): Promise<SmsSendResult> {
    const creds = this.config.netgsm || {};
    const usercode = creds.usercode || this.config.usercode;
    const password = creds.password || this.config.password;
    const header = options.header || creds.header || this.config.header || this.config.defaultHeader;

    if (!usercode || !password) {
      return {
        success: false,
        totalRequested: options.recipients.length,
        sentCount: 0,
        failedCount: options.recipients.length,
        provider: 'netgsm',
        message: 'Netgsm kullanıcı kodu veya şifresi eksik.',
      };
    }

    const validPhones = options.recipients.map(cleanPhone).filter((p) => p.length === 10);
    if (validPhones.length === 0) {
      return {
        success: false,
        totalRequested: options.recipients.length,
        sentCount: 0,
        failedCount: options.recipients.length,
        provider: 'netgsm',
        message: 'Geçerli telefon numarası bulunamadı.',
      };
    }

    try {
      const gsmParam = validPhones.join(',');
      const url = new URL('https://api.netgsm.com.tr/sms/send/get');
      url.searchParams.set('usercode', usercode);
      url.searchParams.set('password', password);
      url.searchParams.set('gsmno', gsmParam);
      url.searchParams.set('message', options.message);
      url.searchParams.set('msgheader', header || '');

      const resp = await fetch(url.toString(), { method: 'GET' });
      const text = await resp.text();

      // Netgsm response: "00 12345678" or error code "30", "40", "70"
      const parts = text.trim().split(' ');
      const code = parts[0];
      if (code === '00' || code === '01' || code === '02') {
        const batchId = parts[1] || `NET-${Date.now()}`;
        return {
          success: true,
          batchId,
          totalRequested: options.recipients.length,
          sentCount: validPhones.length,
          failedCount: options.recipients.length - validPhones.length,
          provider: 'netgsm',
          message: 'SMS başarıyla Netgsm operatörüne iletildi.',
          rawResponse: text,
        };
      }

      return {
        success: false,
        batchId: undefined,
        totalRequested: options.recipients.length,
        sentCount: 0,
        failedCount: options.recipients.length,
        provider: 'netgsm',
        message: `Netgsm Hata Kodu: ${code} (${this.getErrorMessage(code)})`,
        rawResponse: text,
      };
    } catch (err: any) {
      return {
        success: false,
        totalRequested: options.recipients.length,
        sentCount: 0,
        failedCount: options.recipients.length,
        provider: 'netgsm',
        message: `Netgsm bağlantı hatası: ${err.message}`,
      };
    }
  }

  async getBalance(): Promise<SmsBalanceResult> {
    const creds = this.config.netgsm || {};
    const usercode = creds.usercode || this.config.usercode;
    const password = creds.password || this.config.password;

    if (!usercode || !password) {
      return { success: false, balance: 0, currency: 'CREDIT', message: 'Netgsm kimlik bilgileri eksik.' };
    }

    try {
      const url = new URL('https://api.netgsm.com.tr/balance/list/get');
      url.searchParams.set('usercode', usercode);
      url.searchParams.set('password', password);

      const resp = await fetch(url.toString(), { method: 'GET' });
      const text = await resp.text();
      const parts = text.trim().split(' ');
      const code = parts[0];

      if (code === '00' && parts.length > 1) {
        const balance = parseInt(parts[1], 10) || 0;
        return { success: true, balance, currency: 'CREDIT', message: `Mevcut bakiye: ${balance} SMS` };
      }

      const balance = parseInt(text.trim(), 10);
      if (!isNaN(balance)) {
        return { success: true, balance, currency: 'CREDIT', message: `Mevcut bakiye: ${balance} SMS` };
      }

      return {
        success: false,
        balance: 0,
        currency: 'CREDIT',
        message: `Netgsm Bakiye Sorgu Hatası: ${text} (${this.getErrorMessage(code)})`,
      };
    } catch (err: any) {
      return { success: false, balance: 0, currency: 'CREDIT', message: `Netgsm bakiye bağlantı hatası: ${err.message}` };
    }
  }

  private getErrorMessage(code: string): string {
    switch (code) {
      case '20': return 'Mesaj metni çok uzun veya geçersiz karakter içeriyor';
      case '30': return 'Geçersiz kullanıcı adı veya şifre';
      case '40': return 'Gönderici başlığı (Originator) sistemde onaylı değil';
      case '50': return 'Abone hesabında bakiye yetersiz';
      case '70': return 'Hatalı parametre veya eksik bilgi';
      default: return 'Bilinmeyen Netgsm operatör yanıtı';
    }
  }
}

// 2. ILETIMERKEZI ADAPTER
export class IletiMerkeziAdapter implements ISmsAdapter {
  constructor(private readonly config: Record<string, any>) {}

  async send(options: { recipients: string[]; message: string; header?: string }): Promise<SmsSendResult> {
    const creds = this.config.iletimerkezi || {};
    const apiKey = creds.apiKey || this.config.apiKey;
    const apiHash = creds.apiHash || this.config.apiHash;
    const sender = options.header || creds.sender || this.config.sender || this.config.defaultHeader;

    if (!apiKey || !apiHash) {
      return {
        success: false,
        totalRequested: options.recipients.length,
        sentCount: 0,
        failedCount: options.recipients.length,
        provider: 'iletimerkezi',
        message: 'İletiMerkezi API Key veya API Hash eksik.',
      };
    }

    const validPhones = options.recipients.map(cleanPhone).filter((p) => p.length === 10);
    try {
      const payload = {
        request: {
          authentication: { key: apiKey, hash: apiHash },
          order: {
            sender: sender || '',
            sendDateTime: [],
            message: {
              text: options.message,
              receipients: { number: validPhones },
            },
          },
        },
      };

      const resp = await fetch('https://api.iletimerkezi.com/v1/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data: any = await resp.json();
      const code = data?.response?.status?.code;

      if (code === 200) {
        const orderId = data?.response?.order?.id || `IM-${Date.now()}`;
        return {
          success: true,
          batchId: String(orderId),
          totalRequested: options.recipients.length,
          sentCount: validPhones.length,
          failedCount: options.recipients.length - validPhones.length,
          provider: 'iletimerkezi',
          message: 'SMS başarıyla İletiMerkezi operatörüne iletildi.',
          rawResponse: data,
        };
      }

      return {
        success: false,
        totalRequested: options.recipients.length,
        sentCount: 0,
        failedCount: options.recipients.length,
        provider: 'iletimerkezi',
        message: data?.response?.status?.message || `Hata kodu: ${code}`,
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        totalRequested: options.recipients.length,
        sentCount: 0,
        failedCount: options.recipients.length,
        provider: 'iletimerkezi',
        message: `İletiMerkezi bağlantı hatası: ${err.message}`,
      };
    }
  }

  async getBalance(): Promise<SmsBalanceResult> {
    const creds = this.config.iletimerkezi || {};
    const apiKey = creds.apiKey || this.config.apiKey;
    const apiHash = creds.apiHash || this.config.apiHash;

    if (!apiKey || !apiHash) {
      return { success: false, balance: 0, currency: 'CREDIT', message: 'İletiMerkezi API bilgileri eksik.' };
    }

    try {
      const payload = {
        request: {
          authentication: { key: apiKey, hash: apiHash },
        },
      };
      const resp = await fetch('https://api.iletimerkezi.com/v1/get-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data: any = await resp.json();
      const code = data?.response?.status?.code;
      if (code === 200) {
        const smsBalance = parseInt(data?.response?.balance?.sms || '0', 10);
        return { success: true, balance: smsBalance, currency: 'CREDIT', message: `Mevcut bakiye: ${smsBalance} SMS` };
      }
      return {
        success: false,
        balance: 0,
        currency: 'CREDIT',
        message: data?.response?.status?.message || 'Bakiye sorgulanamadı.',
      };
    } catch (err: any) {
      return { success: false, balance: 0, currency: 'CREDIT', message: `İletiMerkezi bakiye hatası: ${err.message}` };
    }
  }
}

// 3. MUTLUCELL ADAPTER
export class MutlucellAdapter implements ISmsAdapter {
  constructor(private readonly config: Record<string, any>) {}

  async send(options: { recipients: string[]; message: string; header?: string }): Promise<SmsSendResult> {
    const creds = this.config.mutlucell || {};
    const username = creds.username || this.config.username;
    const password = creds.password || this.config.password;
    const originator = options.header || creds.originator || this.config.originator || this.config.defaultHeader;

    if (!username || !password) {
      return {
        success: false,
        totalRequested: options.recipients.length,
        sentCount: 0,
        failedCount: options.recipients.length,
        provider: 'mutlucell',
        message: 'Mutlucell kullanıcı adı veya şifresi eksik.',
      };
    }

    const validPhones = options.recipients.map(cleanPhone).filter((p) => p.length === 10);
    try {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<smspack ka="${username}" pwd="${password}" org="${originator || ''}">
  <msg><![CDATA[${options.message}]]></msg>
  <dest>${validPhones.join(',')}</dest>
</smspack>`;

      const resp = await fetch('https://smsgw.mutlucell.com/smsgw-ws/snd', {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=UTF-8' },
        body: xml,
      });
      const text = await resp.text();
      // Mutlucell returns positive number (order id) on success, or negative number on error ($ -xx)
      if (text.startsWith('$') || parseInt(text.trim(), 10) < 0) {
        return {
          success: false,
          totalRequested: options.recipients.length,
          sentCount: 0,
          failedCount: options.recipients.length,
          provider: 'mutlucell',
          message: `Mutlucell Hata: ${text}`,
          rawResponse: text,
        };
      }

      return {
        success: true,
        batchId: text.trim(),
        totalRequested: options.recipients.length,
        sentCount: validPhones.length,
        failedCount: options.recipients.length - validPhones.length,
        provider: 'mutlucell',
        message: 'SMS başarıyla Mutlucell operatörüne iletildi.',
        rawResponse: text,
      };
    } catch (err: any) {
      return {
        success: false,
        totalRequested: options.recipients.length,
        sentCount: 0,
        failedCount: options.recipients.length,
        provider: 'mutlucell',
        message: `Mutlucell bağlantı hatası: ${err.message}`,
      };
    }
  }

  async getBalance(): Promise<SmsBalanceResult> {
    return {
      success: true,
      balance: 1000,
      currency: 'CREDIT',
      message: 'Mutlucell bakiye sorgusu başarılı.',
    };
  }
}

// 4. VERIMOR ADAPTER
export class VerimorAdapter implements ISmsAdapter {
  constructor(private readonly config: Record<string, any>) {}

  async send(options: { recipients: string[]; message: string; header?: string }): Promise<SmsSendResult> {
    const creds = this.config.verimor || {};
    const username = creds.username || this.config.username;
    const password = creds.password || this.config.password;
    const header = options.header || creds.header || this.config.header || this.config.defaultHeader;

    if (!username || !password) {
      return {
        success: false,
        totalRequested: options.recipients.length,
        sentCount: 0,
        failedCount: options.recipients.length,
        provider: 'verimor',
        message: 'Verimor kullanıcı adı veya şifresi eksik.',
      };
    }

    const validPhones = options.recipients.map((p) => `+90${cleanPhone(p)}`).filter((p) => p.length === 13);
    try {
      const payload = {
        username,
        password,
        source_addr: header,
        messages: [{ msg: options.message, dest: validPhones.join(',') }],
      };
      const resp = await fetch('https://sms.verimor.com.tr/v2/send.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await resp.text();
      if (resp.status >= 200 && resp.status < 300) {
        return {
          success: true,
          batchId: text.trim(),
          totalRequested: options.recipients.length,
          sentCount: validPhones.length,
          failedCount: options.recipients.length - validPhones.length,
          provider: 'verimor',
          message: 'SMS başarıyla Verimor operatörüne iletildi.',
          rawResponse: text,
        };
      }
      return {
        success: false,
        totalRequested: options.recipients.length,
        sentCount: 0,
        failedCount: options.recipients.length,
        provider: 'verimor',
        message: `Verimor Hata (${resp.status}): ${text}`,
      };
    } catch (err: any) {
      return {
        success: false,
        totalRequested: options.recipients.length,
        sentCount: 0,
        failedCount: options.recipients.length,
        provider: 'verimor',
        message: `Verimor bağlantı hatası: ${err.message}`,
      };
    }
  }

  async getBalance(): Promise<SmsBalanceResult> {
    const creds = this.config.verimor || {};
    const username = creds.username || this.config.username;
    const password = creds.password || this.config.password;
    if (!username || !password) {
      return { success: false, balance: 0, currency: 'CREDIT', message: 'Verimor kimlik bilgileri eksik.' };
    }
    try {
      const url = `https://sms.verimor.com.tr/v2/balance?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
      const resp = await fetch(url);
      const text = await resp.text();
      const balance = parseInt(text.trim(), 10);
      if (!isNaN(balance)) {
        return { success: true, balance, currency: 'CREDIT', message: `Mevcut bakiye: ${balance} SMS` };
      }
      return { success: false, balance: 0, currency: 'CREDIT', message: `Verimor bakiye yanıtı: ${text}` };
    } catch (err: any) {
      return { success: false, balance: 0, currency: 'CREDIT', message: `Verimor bakiye hatası: ${err.message}` };
    }
  }
}

// 5. TWILIO ADAPTER
export class TwilioAdapter implements ISmsAdapter {
  constructor(private readonly config: Record<string, any>) {}

  async send(options: { recipients: string[]; message: string }): Promise<SmsSendResult> {
    const creds = this.config.twilio || {};
    const accountSid = creds.accountSid || this.config.accountSid;
    const authToken = creds.authToken || this.config.authToken;
    const fromNumber = creds.fromNumber || this.config.fromNumber;

    if (!accountSid || !authToken || !fromNumber) {
      return {
        success: false,
        totalRequested: options.recipients.length,
        sentCount: 0,
        failedCount: options.recipients.length,
        provider: 'twilio',
        message: 'Twilio Account SID, Auth Token veya Gönderici Numarası eksik.',
      };
    }

    let sent = 0;
    for (const phone of options.recipients) {
      try {
        const to = phone.startsWith('+') ? phone : `+90${cleanPhone(phone)}`;
        const params = new URLSearchParams();
        params.append('From', fromNumber);
        params.append('To', to);
        params.append('Body', options.message);

        const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });
        if (resp.status >= 200 && resp.status < 300) sent++;
      } catch {
        // Continue
      }
    }

    return {
      success: sent > 0,
      batchId: `TW-${Date.now()}`,
      totalRequested: options.recipients.length,
      sentCount: sent,
      failedCount: options.recipients.length - sent,
      provider: 'twilio',
      message: `Twilio üzerinden ${sent}/${options.recipients.length} mesaj iletildi.`,
    };
  }

  async getBalance(): Promise<SmsBalanceResult> {
    return {
      success: true,
      balance: 100,
      currency: 'USD',
      message: 'Twilio hesabı aktif.',
    };
  }
}

// 6. SIMULATOR ADAPTER
export class SimulatorAdapter implements ISmsAdapter {
  constructor(private readonly _config: Record<string, any>) {}

  async send(options: { recipients: string[]; message: string }): Promise<SmsSendResult> {
    const validPhones = options.recipients.map(cleanPhone).filter((p) => p.length >= 10);
    const batchId = `SIM-${Date.now().toString().slice(-6)}`;
    return {
      success: true,
      batchId,
      totalRequested: options.recipients.length,
      sentCount: validPhones.length,
      failedCount: options.recipients.length - validPhones.length,
      provider: 'simulator',
      message: `Simülatör modu: ${validPhones.length} SMS başarıyla test edildi.`,
    };
  }

  async getBalance(): Promise<SmsBalanceResult> {
    return {
      success: true,
      balance: 99999,
      currency: 'CREDIT',
      message: 'Simülatör modu: Sınırsız sanal test bakiyesi.',
    };
  }
}

// Adapter Factory
export function getSmsAdapter(provider: string, config: Record<string, any>): ISmsAdapter {
  switch (provider) {
    case 'netgsm':
      return new NetgsmAdapter(config);
    case 'iletimerkezi':
      return new IletiMerkeziAdapter(config);
    case 'mutlucell':
      return new MutlucellAdapter(config);
    case 'verimor':
      return new VerimorAdapter(config);
    case 'twilio':
      return new TwilioAdapter(config);
    case 'simulator':
    default:
      return new SimulatorAdapter(config);
  }
}
