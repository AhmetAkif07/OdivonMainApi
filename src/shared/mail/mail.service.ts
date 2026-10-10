import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendWelcomeGymOwnerInput {
  to: string;
  displayName?: string | null;
  tenantName: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor() {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host = process.env.SMTP_HOST || 'smtp.hostinger.com';
    const port = Number(process.env.SMTP_PORT || 465);
    const user = process.env.SMTP_USER || 'info@odivon.com';
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;

    if (!pass) {
      this.logger.warn(
        'SMTP_PASS ortam değişkeni (.env) tanımlı değil. E-posta gönderimi pasif durumda.',
      );
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
      });
      this.logger.log(`SMTP istemcisi yapılandırıldı: ${host}:${port} (${user})`);
    } catch (error) {
      this.logger.error('SMTP transport oluşturulamadı', error);
    }
  }

  async sendWelcomeGymOwner(input: SendWelcomeGymOwnerInput): Promise<boolean> {
    if (!this.transporter) {
      this.initTransporter();
      if (!this.transporter) {
        this.logger.warn(
          `Hoş geldin maili gönderilemedi (${input.to}): SMTP_PASS tanımlanmamış.`,
        );
        return false;
      }
    }

    const from = process.env.SMTP_FROM || '"OdivonGYM" <info@odivon.com>';
    const appUrl = process.env.APP_URL || 'https://odivongym.app';
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
      const info = await this.transporter.sendMail({
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
}
