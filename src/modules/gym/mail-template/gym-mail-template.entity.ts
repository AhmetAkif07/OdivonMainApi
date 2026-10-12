export interface GymMailTemplate {
  enabled: boolean;
  subject: string;
  heading: string;
  customMessage: string;
  includeCredentials: boolean;
  includeQrCodeInfo: boolean;
  mobileAppUrl: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_MEMBER_MAIL_TEMPLATE: GymMailTemplate = {
  enabled: true,
  subject: '{{tenantName}} Ailesine Hoş Geldiniz! 🏋️‍♂️',
  heading: 'Aramıza Hoş Geldiniz!',
  customMessage:
    'Salonumuza kaydınız başarıyla tamamlanmıştır. Sağlıklı, dinamik ve hedeflerinize ulaştığınız bir antrenman dönemi dileriz!',
  includeCredentials: true,
  includeQrCodeInfo: true,
  mobileAppUrl: 'https://gym.odivon.com',
};
