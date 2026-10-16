/** Appointment SMS a salon can send; each can be switched off and reworded per tenant. */
export const SMS_TEMPLATE_KINDS = ['confirmation', 'reminder', 'cancellation'] as const;
export type SmsTemplateKind = (typeof SMS_TEMPLATE_KINDS)[number];

export interface SmsTemplate {
  enabled: boolean;
  text: string;
}

export type SmsTemplates = Record<SmsTemplateKind, SmsTemplate>;

/** Placeholders: {customerName} {salonName} {branchName} {date} {time} {staffName} {services}. */
export const DEFAULT_SMS_TEMPLATES: SmsTemplates = {
  confirmation: {
    enabled: true,
    text: 'Sayın {customerName}, {salonName} randevunuz {date} {time} için onaylandı. ({services})',
  },
  reminder: {
    enabled: true,
    text: 'Sayın {customerName}, {salonName} randevunuzu hatırlatırız: {date} {time}. Görüşmek üzere!',
  },
  cancellation: {
    enabled: true,
    text: 'Sayın {customerName}, {salonName} {date} {time} randevunuz iptal edilmiştir.',
  },
};

export function mergeSmsTemplates(...layers: (Partial<Record<SmsTemplateKind, Partial<SmsTemplate>>> | undefined)[]): SmsTemplates {
  const merged = {} as SmsTemplates;
  for (const kind of SMS_TEMPLATE_KINDS) {
    merged[kind] = Object.assign({}, DEFAULT_SMS_TEMPLATES[kind], ...layers.map((layer) => stripUndefined(layer?.[kind])));
  }
  return merged;
}

/** Replaces `{name}` placeholders; unknown ones are left empty. */
export function renderSms(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '').replace(/\s+/g, ' ').trim();
}

function stripUndefined<T extends object>(value: T | undefined): Partial<T> {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>;
}
