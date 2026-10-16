/** Result of handing one SMS to the provider (delivery reports are not tracked yet). */
export interface SmsSendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

/** An SMS gateway. Credentials come from the environment only, never from Firestore or code. */
export interface SmsProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** `to` is E.164 (`+905321234567`). */
  send(to: string, text: string): Promise<SmsSendResult>;
}

/** Stand-in when no gateway is configured: every send fails without leaving the process. */
export class DisabledSmsProvider implements SmsProvider {
  readonly name = 'none';

  isConfigured(): boolean {
    return false;
  }

  async send(): Promise<SmsSendResult> {
    return { ok: false, error: 'SMS sağlayıcısı yapılandırılmamış.' };
  }
}

export interface NetgsmConfig {
  usercode: string;
  password: string;
  /** Approved sender name (başlık). */
  header: string;
  apiUrl?: string;
}

const NETGSM_SEND_URL = 'https://api.netgsm.com.tr/sms/rest/v2/send';
const NETGSM_TIMEOUT_MS = 10_000;

/**
 * Netgsm REST v2 (`POST /sms/rest/v2/send`, HTTP basic auth). Response code `00` = queued, with a
 * `jobid`; anything else is an error code from Netgsm's table (e.g. 30 = bad credentials / IP).
 */
export class NetgsmSmsProvider implements SmsProvider {
  readonly name = 'netgsm';

  constructor(
    private readonly config: NetgsmConfig,
    private readonly http: typeof fetch = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.config.usercode && this.config.password && this.config.header);
  }

  async send(to: string, text: string): Promise<SmsSendResult> {
    if (!this.isConfigured()) return { ok: false, error: 'Netgsm yapılandırılmamış.' };
    const auth = Buffer.from(`${this.config.usercode}:${this.config.password}`).toString('base64');
    try {
      const response = await this.http(this.config.apiUrl || NETGSM_SEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({
          msgheader: this.config.header,
          encoding: 'TR',
          messages: [{ msg: text, no: to.replace(/^\+/, '') }],
        }),
        signal: AbortSignal.timeout(NETGSM_TIMEOUT_MS),
      });
      const body = (await response.json().catch(() => ({}))) as { code?: string; jobid?: string; description?: string };
      if (response.ok && body.code === '00') return { ok: true, providerMessageId: body.jobid };
      return { ok: false, error: `Netgsm ${body.code ?? response.status}: ${body.description ?? 'gönderilemedi'}` };
    } catch (error) {
      return { ok: false, error: `Netgsm isteği başarısız: ${(error as Error).message}` };
    }
  }
}

/** `SMS_PROVIDER=netgsm` with `NETGSM_USERCODE`, `NETGSM_PASSWORD`, `NETGSM_HEADER`; otherwise disabled. */
export function smsProviderFromEnv(env: NodeJS.ProcessEnv = process.env): SmsProvider {
  const provider = (env['SMS_PROVIDER'] ?? (env['NETGSM_USERCODE'] ? 'netgsm' : '')).trim().toLowerCase();
  if (provider === 'netgsm') {
    return new NetgsmSmsProvider({
      usercode: env['NETGSM_USERCODE'] ?? '',
      password: env['NETGSM_PASSWORD'] ?? '',
      header: env['NETGSM_HEADER'] ?? '',
      apiUrl: env['NETGSM_API_URL'],
    });
  }
  return new DisabledSmsProvider();
}
