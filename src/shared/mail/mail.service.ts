import { Injectable, Logger } from '@nestjs/common';
import * as net from 'net';
import type { Transporter } from 'nodemailer';
import * as tls from 'tls';
import { runInBackground } from '../http/background';
import { buildModuleWelcomeEmail, ModuleWelcomeInput, WelcomeModule } from './welcome-templates';
import { ProductModule } from '../authorization/constants';

export interface SendMemberWelcomeInput {
  to: string;
  displayName: string;
  tenantName: string;
  password?: string;
  memberNumber?: string;
  template?: {
    subject?: string;
    heading?: string;
    customMessage?: string;
    includeCredentials?: boolean;
    includeQrCodeInfo?: boolean;
    mobileAppUrl?: string;
  } | null;
}

export interface SendVerificationEmailInput {
  to: string;
  displayName?: string | null;
  tenantName: string;
  verificationLink: string;
  module: ProductModule;
}

export interface SendWelcomeGymOwnerInput {
  to: string;
  displayName?: string | null;
  tenantName: string;
}

export type SendModuleWelcomeInput = Omit<ModuleWelcomeInput, 'loginUrl'>;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor() {
    if (!process.env.SMTP_PASS && !this.hostingerApiConfigured()) {
      this.logger.warn(
        'SMTP_PASS veya Hostinger Mail API yapılandırması yok. E-posta gönderimi pasif durumda.',
      );
    }
  }

  private hostingerApiConfigured(): boolean {
    return Boolean(process.env.HOSTINGER_MAIL_API_TOKEN && process.env.HOSTINGER_MAILBOX_RESOURCE_ID);
  }

  private async sendMessage(message: {
    from: string | { name: string; address: string };
    to: string;
    subject: string;
    html: string;
  }): Promise<{ messageId: string }> {
    if (this.hostingerApiConfigured()) {
      const mailboxId = encodeURIComponent(process.env.HOSTINGER_MAILBOX_RESOURCE_ID!);
      const displayName = typeof message.from === 'string'
        ? message.from.match(/^\s*"?([^"<]+)"?\s*</)?.[1]?.trim() || 'OdivonGYM'
        : message.from.name;
      const response = await fetch(`https://api.mail.hostinger.com/api/v1/mailboxes/${mailboxId}/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.HOSTINGER_MAIL_API_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          to: [message.to],
          displayName,
          subject: message.subject,
          html: message.html,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status !== 204) {
        throw new Error(`Hostinger Mail API HTTP ${response.status}`);
      }
      return { messageId: 'Hostinger Mail API accepted' };
    }

    if (!this.transporter) {
      throw new Error('SMTP transport unavailable');
    }
    return this.transporter.sendMail(message);
  }

  // nodemailer is loaded and the transport created on the first send, not at application
  // startup: the Worker boots inside the isolate startup CPU budget.
  private async initTransporter(): Promise<void> {
    const host = process.env.SMTP_HOST || 'smtp.hostinger.com';
    const port = Number(process.env.SMTP_PORT || 465);
    const user = process.env.SMTP_USER || 'info@odivon.com';
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;

    if (!pass) return;

    try {
      const nodemailer = await import('nodemailer');
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
        // nodemailer resolves the host itself and connects to the IP with an SNI override, which
        // Cloudflare Workers sockets do not support. Connecting by host name works on both
        // runtimes, so the socket is opened here and handed over.
        getSocket: (_options, callback) => {
          const socket = secure ? tls.connect({ host, port, servername: host }) : net.connect(port, host);
          const onError = (error: Error) => callback(error, undefined);
          socket.once('error', onError);
          socket.once(secure ? 'secureConnect' : 'connect', () => {
            socket.removeListener('error', onError);
            callback(null, { connection: socket, secured: secure });
          });
        },
      });
      this.logger.log(`SMTP istemcisi yapılandırıldı: ${host}:${port} (${user})`);
    } catch (error) {
      this.logger.error('SMTP transport oluşturulamadı', error);
    }
  }

  sendWelcomeGymOwner(input: SendWelcomeGymOwnerInput): Promise<boolean> {
    return runInBackground(this.deliverWelcomeGymOwner(input));
  }

  private async deliverWelcomeGymOwner(input: SendWelcomeGymOwnerInput): Promise<boolean> {
    if (!this.transporter && !this.hostingerApiConfigured()) {
      await this.initTransporter();
      if (!this.transporter) {
        this.logger.warn(
          `Hoş geldin maili gönderilemedi (${input.to}): e-posta sağlayıcısı yapılandırılmamış.`,
        );
        return false;
      }
    }

    const from = process.env.SMTP_FROM || '"OdivonGYM" <info@odivon.com>';
    const appUrl = process.env.APP_URL || 'https://gym.odivon.com';
    const loginUrl = `${appUrl}/auth/login`;
    const recipientName = input.displayName?.trim() || 'Salon Yöneticisi';
    const tenantName = input.tenantName.trim();

    const subject = `OdivonGYM'e Hoş Geldiniz! 🚀 (${tenantName})`;

    const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OdivonGYM'e Hoş Geldiniz</title>
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
                      SPOR SALONU YÖNETİM PLATFORMU
                    </div>
                    <h1 style="margin: 0; font-size: 26px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px; line-height: 1.2;">
                      Aramıza Hoş Geldiniz! 🏋️‍♂️
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
                <strong style="color: #6366f1;">${tenantName}</strong> spor salonunuz için OdivonGYM SaaS hesabınız başarıyla oluşturuldu. 14 günlük tam sürüm ücretsiz deneme süreniz an itibarıyla başladı!
              </p>

              <!-- Highlights Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; margin-bottom: 28px; padding: 20px;">
                <tr>
                  <td>
                    <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #818cf8; margin-bottom: 12px;">
                      HESAP & DENEME DETAYLARI
                    </div>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size: 13px; color: #cbd5e1;">
                      <tr>
                        <td style="padding: 6px 0; color: #94a3b8;">Salon Adı:</td>
                        <td style="padding: 6px 0; font-weight: 700; color: #ffffff; text-align: right;">${tenantName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #94a3b8;">Yönetici E-posta:</td>
                        <td style="padding: 6px 0; font-weight: 700; color: #ffffff; text-align: right;">${input.to}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #94a3b8;">Deneme Süresi:</td>
                        <td style="padding: 6px 0; font-weight: 700; color: #10b981; text-align: right;">14 Gün (Kredi Kartı Gerekmez)</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Steps Guide -->
              <div style="font-size: 13px; font-weight: 700; color: #f8fafc; margin-bottom: 12px;">
                Hemen Başlamak İçin 3 Kolay Adım:
              </div>
              <ul style="margin: 0 0 28px; padding-left: 20px; font-size: 13px; color: #94a3b8; line-height: 1.8;">
                <li><strong style="color: #cbd5e1;">Şube ve Alanlar:</strong> Salonunuzun antrenman alanlarını ve çalışma saatlerini belirleyin.</li>
                <li><strong style="color: #cbd5e1;">Üyelik Paketleri:</strong> Aylık, yıllık veya seanslık paketlerinizi tanımlayın.</li>
                <li><strong style="color: #cbd5e1;">Turnike & QR Geçiş:</strong> Donanım veya mobil QR kod ile kaçak geçişleri anında sıfırlayın.</li>
              </ul>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="center">
                    <a href="${loginUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; padding: 14px 36px; border-radius: 12px; box-shadow: 0 10px 25px rgba(99,102,241,0.4); text-transform: uppercase; letter-spacing: 0.5px;">
                      Yönetim Paneline Giriş Yap →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5; text-align: center;">
                Herhangi bir sorunuz olursa <a href="mailto:info@odivon.com" style="color: #818cf8; text-decoration: underline;">info@odivon.com</a> üzerinden bize 7/24 ulaşabilirsiniz.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #090d16; padding: 24px 32px; border-top: 1px solid #1e293b; text-align: center;">
              <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; color: #94a3b8;">
                © ${new Date().getFullYear()} OdivonGYM · Tüm Hakları Saklıdır.
              </p>
              <p style="margin: 0; font-size: 10px; color: #475569;">
                Bu e-posta OdivonGYM'e üye olduğunuz için otomatik olarak gönderilmiştir.
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

    try {
      const info = await this.sendMessage({
        from,
        to: input.to,
        subject,
        html,
      });
      this.logger.log(`Hoş geldin maili başarıyla gönderildi: ${input.to} (MessageId: ${info.messageId})`);
      return true;
    } catch (error: any) {
      this.logger.error(`Hoş geldin maili gönderim hatası (${input.to}): ${error?.message || error}`);
      return false;
    }
  }

  /**
   * Owner welcome mail for every module except gym (see `sendWelcomeGymOwner`). The panel button
   * needs `APP_URL_<MODULE>` (e.g. `APP_URL_VET`); without it the mail goes out with no button.
   */
  sendModuleWelcome(input: SendModuleWelcomeInput): Promise<boolean> {
    return runInBackground(this.deliverModuleWelcome(input));
  }

  private async deliverModuleWelcome(input: SendModuleWelcomeInput): Promise<boolean> {
    if (!this.transporter && !this.hostingerApiConfigured()) {
      await this.initTransporter();
      if (!this.transporter) {
        this.logger.warn(
          `Hoş geldin maili gönderilemedi (${input.to}): e-posta sağlayıcısı yapılandırılmamış.`,
        );
        return false;
      }
    }

    try {
      const { brand, subject, html } = buildModuleWelcomeEmail({
        ...input,
        loginUrl: moduleLoginUrl(input.module),
      });
      const info = await this.sendMessage({
        from: { name: brand, address: fromAddress() },
        to: input.to,
        subject,
        html,
      });
      this.logger.log(
        `Hoş geldin maili başarıyla gönderildi [${input.module}]: ${input.to} (MessageId: ${info.messageId})`,
      );
      return true;
    } catch (error: any) {
      this.logger.error(
        `Hoş geldin maili gönderim hatası [${input.module}] (${input.to}): ${error?.message || error}`,
      );
      return false;
    }
  }

  sendVerificationEmail(input: SendVerificationEmailInput): Promise<boolean> {
    return runInBackground(this.deliverVerificationEmail(input));
  }

  private async deliverVerificationEmail(input: SendVerificationEmailInput): Promise<boolean> {
    if (!this.transporter && !this.hostingerApiConfigured()) {
      await this.initTransporter();
      if (!this.transporter) {
        this.logger.warn(
          `Doğrulama maili gönderilemedi (${input.to}): e-posta sağlayıcısı yapılandırılmamış.`,
        );
        return false;
      }
    }

    const brand = input.module === 'gym' ? 'OdivonGYM' : MODULE_VERIFICATION_NAMES[input.module];
    const tenantLabel = input.module === 'gym' ? 'Salon Adı' : input.module === 'vet' ? 'Klinik Adı' : 'İşletme Adı';
    const accountDescription = input.module === 'gym' ? 'spor salonunuz' : input.module === 'vet' ? 'kliniğiniz' : 'işletmeniz';
    const from = { name: brand, address: fromAddress() };
    const recipientName = input.displayName?.trim() || 'İşletme Yöneticisi';
    const tenantName = input.tenantName.trim();
    const subject = `${brand} Hesabınızı Doğrulayın ✉️ (${tenantName})`;

    const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brand} E-posta Doğrulama</title>
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
                      HESAP DOĞRULAMA & GÜVENLİK ✉️
                    </div>
                    <h1 style="margin: 0; font-size: 26px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px; line-height: 1.2;">
                      E-Posta Adresinizi Doğrulayın
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
                <strong style="color: #818cf8;">${tenantName}</strong> ${accountDescription} için ${brand} hesabınız başarıyla oluşturuldu. Hesabınızı güvenle aktifleştirmek ve yönetim paneline giriş yapabilmek için lütfen aşağıdaki butona tıklayarak e-posta adresinizi doğrulayın.
              </p>

              <!-- Highlights Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; margin-bottom: 28px; padding: 20px;">
                <tr>
                  <td>
                    <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #818cf8; margin-bottom: 12px;">
                      HESAP BİLGİLERİ
                    </div>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size: 13px; color: #cbd5e1;">
                      <tr>
                        <td style="padding: 6px 0; color: #94a3b8;">${tenantLabel}:</td>
                        <td style="padding: 6px 0; font-weight: 700; color: #ffffff; text-align: right;">${tenantName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #94a3b8;">Yönetici E-posta:</td>
                        <td style="padding: 6px 0; font-weight: 700; color: #ffffff; text-align: right;">${input.to}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #94a3b8;">Bağlantı Geçerliliği:</td>
                        <td style="padding: 6px 0; font-weight: 700; color: #10b981; text-align: right;">24 Saat</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="center">
                    <a href="${input.verificationLink}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; padding: 16px 40px; border-radius: 12px; box-shadow: 0 10px 25px rgba(99,102,241,0.4); text-transform: uppercase; letter-spacing: 0.5px;">
                      E-Posta Adresimi Doğrula →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 12px; font-size: 12px; color: #64748b; line-height: 1.5;">
                Buton çalışmıyorsa aşağıdaki bağlantıyı kopyalayıp tarayıcınızın adres çubuğuna yapıştırabilirsiniz:
              </p>
              <p style="margin: 0 0 24px; font-size: 11px; word-break: break-all; color: #818cf8; background-color: #0b1120; padding: 10px 14px; border-radius: 8px; border: 1px solid #1e293b;">
                <a href="${input.verificationLink}" style="color: #818cf8; text-decoration: underline;">${input.verificationLink}</a>
              </p>

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
                Bu e-posta ${brand} hesabınızı doğrulamak amacıyla gönderilmiştir. Eğer bu hesabı siz açmadıysanız dikkate almayınız.
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

    try {
      const info = await this.sendMessage({
        from,
        to: input.to,
        subject,
        html,
      });
      this.logger.log(`Doğrulama maili başarıyla gönderildi: ${input.to} (MessageId: ${info.messageId})`);
      return true;
    } catch (error: any) {
      this.logger.error(`Doğrulama maili gönderim hatası (${input.to}): ${error?.message || error}`);
      return false;
    }
  }

  sendMemberWelcomeEmail(input: SendMemberWelcomeInput): Promise<boolean> {
    return runInBackground(this.deliverMemberWelcomeEmail(input));
  }

  private async deliverMemberWelcomeEmail(input: SendMemberWelcomeInput): Promise<boolean> {
    if (!this.transporter && !this.hostingerApiConfigured()) {
      await this.initTransporter();
      if (!this.transporter) {
        this.logger.warn(
          `Üye hoş geldin maili gönderilemedi (${input.to}): e-posta sağlayıcısı yapılandırılmamış.`,
        );
        return false;
      }
    }

    const from = process.env.SMTP_FROM || '"OdivonGYM" <info@odivon.com>';
    const appUrl = input.template?.mobileAppUrl?.trim() || process.env.APP_URL || 'https://gym.odivon.com';
    const loginUrl = `${appUrl}/auth/login`;
    const recipientName = input.displayName.trim() || 'Değerli Üyemiz';
    const tenantName = input.tenantName.trim();
    const password = input.password || '******';
    const memberNumber = input.memberNumber || '';

    const template = input.template;
    const includeCredentials = template?.includeCredentials !== false;
    const includeQrCodeInfo = template?.includeQrCodeInfo !== false;

    // Helper for placeholder replacement
    const replaceVars = (text: string): string => {
      if (!text) return '';
      return text
        .replace(/\{\{\s*memberName\s*\}\}/gi, recipientName)
        .replace(/\{\{\s*tenantName\s*\}\}/gi, tenantName)
        .replace(/\{\{\s*email\s*\}\}/gi, input.to)
        .replace(/\{\{\s*password\s*\}\}/gi, password)
        .replace(/\{\{\s*memberNumber\s*\}\}/gi, memberNumber || '-')
        .replace(/\{\{\s*appUrl\s*\}\}/gi, appUrl)
        .replace(/\{\{\s*loginUrl\s*\}\}/gi, loginUrl);
    };

    const subjectRaw = template?.subject?.trim() || '{{tenantName}} Ailesine Hoş Geldiniz! 🏋️‍♂️';
    const subject = replaceVars(subjectRaw);

    const headingRaw = template?.heading?.trim() || 'Aramıza Hoş Geldiniz! 🏋️‍♂️';
    const heading = replaceVars(headingRaw);

    const customMessageRaw =
      template?.customMessage?.trim() ||
      'Salonumuza kaydınız başarıyla tamamlanmıştır. Sağlıklı, dinamik ve hedeflerinize ulaştığınız bir antrenman dönemi dileriz!';
    const customMessage = replaceVars(customMessageRaw);

    const credentialsHtml = includeCredentials
      ? `
              <!-- Credentials Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; margin-bottom: 24px; padding: 20px;">
                <tr>
                  <td>
                    <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #818cf8; margin-bottom: 12px;">
                      GİRİŞ & HESAP BİLGİLERİNİZ 🔐
                    </div>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size: 13px; color: #cbd5e1;">
                      <tr>
                        <td style="padding: 6px 0; color: #94a3b8;">Spor Salonu:</td>
                        <td style="padding: 6px 0; font-weight: 700; color: #ffffff; text-align: right;">${tenantName}</td>
                      </tr>
                      ${
                        memberNumber
                          ? `<tr>
                        <td style="padding: 6px 0; color: #94a3b8;">Üye Numarası:</td>
                        <td style="padding: 6px 0; font-weight: 700; color: #ffffff; text-align: right;">${memberNumber}</td>
                      </tr>`
                          : ''
                      }
                      <tr>
                        <td style="padding: 6px 0; color: #94a3b8;">Giriş E-Postası:</td>
                        <td style="padding: 6px 0; font-weight: 700; color: #ffffff; text-align: right;">${input.to}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #94a3b8;">Giriş Parolası:</td>
                        <td style="padding: 6px 0; text-align: right;">
                          <span style="display: inline-block; font-family: monospace, Courier, sans-serif; background-color: #312e81; color: #c7d2fe; padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 13px; letter-spacing: 0.5px;">
                            ${password}
                          </span>
                        </td>
                      </tr>
                    </table>
                    <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #334155; font-size: 11px; color: #94a3b8;">
                      * Güvenliğiniz için ilk girişinizden sonra şifrenizi profil ayarlarından güncelleyebilirsiniz.
                    </div>
                  </td>
                </tr>
              </table>`
      : '';

    const qrPassHtml = includeQrCodeInfo
      ? `
              <!-- QR Code & Turnstile Info Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0f172a; border: 1px solid #4338ca; border-radius: 16px; margin-bottom: 24px; padding: 20px;">
                <tr>
                  <td>
                    <div style="display: inline-block; background-color: rgba(99,102,241,0.2); padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #a5b4fc; margin-bottom: 10px;">
                      TEMASSIZ QR KOD İLE TURNİKE GEÇİŞİ 📲
                    </div>
                    <p style="margin: 0 0 12px; font-size: 13px; color: #cbd5e1; line-height: 1.6;">
                      Spor salonumuza giriş yaparken kart taşımanıza gerek yok! Telefonunuzdan OdivonGYM mobil uygulamasına giriş yaparak profilinizdeki <strong>dinamik QR kodu</strong> turnike okuyucusuna gösterip anında geçiş yapabilirsiniz.
                    </p>
                    <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #94a3b8; line-height: 1.7;">
                      <li><strong style="color: #cbd5e1;">Turnike Girişi:</strong> Telefonunuzdaki dinamik QR kod ile turnikelerden temassız geçiş.</li>
                      <li><strong style="color: #cbd5e1;">Antrenman & Program:</strong> Antrenörünüzün tanımladığı programı ve egzersizleri takip edin.</li>
                      <li><strong style="color: #cbd5e1;">Grup Dersleri:</strong> Ders takvimini görüntüleyin ve saniyeler içinde yerinizi ayırtın.</li>
                    </ul>
                  </td>
                </tr>
              </table>`
      : '';

    const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
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
                      ${tenantName.toUpperCase()}
                    </div>
                    <h1 style="margin: 0; font-size: 26px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px; line-height: 1.2;">
                      ${heading}
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
                ${customMessage}
              </p>

              ${credentialsHtml}
              ${qrPassHtml}

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${loginUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; padding: 16px 36px; border-radius: 12px; box-shadow: 0 10px 25px rgba(99,102,241,0.4); text-transform: uppercase; letter-spacing: 0.5px;">
                      Mobil Uygulamaya / Portala Giriş Yap →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5; text-align: center;">
                Herhangi bir sorunuz olduğunda ${tenantName} resepsiyonuna veya <a href="mailto:info@odivon.com" style="color: #818cf8; text-decoration: underline;">info@odivon.com</a> adresine danışabilirsiniz.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #090d16; padding: 24px 32px; border-top: 1px solid #1e293b; text-align: center;">
              <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; color: #94a3b8;">
                © ${new Date().getFullYear()} ${tenantName} · OdivonGYM Altyapısı ile Güçlendirilmiştir.
              </p>
              <p style="margin: 0; font-size: 10px; color: #475569;">
                Bu e-posta ${tenantName} spor salonuna üye kaydınız yapıldığı için bilgilendirme amaçlı gönderilmiştir.
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

    try {
      const info = await this.sendMessage({
        from,
        to: input.to,
        subject,
        html,
      });
      this.logger.log(`Üye hoş geldin maili gönderildi: ${input.to} (MessageId: ${info.messageId})`);
      return true;
    } catch (error: any) {
      this.logger.error(`Üye hoş geldin maili gönderim hatası (${input.to}): ${error?.message || error}`);
      return false;
    }
  }
}

const MODULE_VERIFICATION_NAMES: Record<Exclude<ProductModule, 'gym'>, string> = {
  vet: 'Odivon Vet',
  farm: 'OdivonFARM',
  spa: 'OdivonSPA',
  hair: 'OdivonPro Hair',
  beauty: 'Odivon Beauty',
  apm: 'Odivon APM',
};

function moduleLoginUrl(module: WelcomeModule): string | null {
  const appUrl = process.env[`APP_URL_${module.toUpperCase()}`]?.trim();
  const path = module === 'vet' ? '/login' : '/auth/login';
  return appUrl ? `${appUrl.replace(/\/+$/, '')}${path}` : null;
}

/** Sender address of `SMTP_FROM` (`"Name" <address>` or a bare address); the display name is per module. */
function fromAddress(): string {
  const from = process.env.SMTP_FROM?.trim();
  const address = from?.match(/<([^>]+)>/)?.[1] ?? from;
  return address && address.includes('@') ? address.trim() : process.env.SMTP_USER || 'info@odivon.com';
}
