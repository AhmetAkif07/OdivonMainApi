/** Placeholders an admin can use in campaign subjects and bodies. */
export interface TemplateVars {
  tenantName?: string | null;
  name?: string | null;
  email?: string | null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Replaces {{isletme}}, {{ad}} and {{email}} (English aliases too). Values are HTML-escaped when `html`. */
export function renderPlaceholders(template: string, vars: TemplateVars, html: boolean): string {
  const values: Record<string, string> = {
    isletme: vars.tenantName || '',
    tenant: vars.tenantName || '',
    ad: vars.name || vars.tenantName || '',
    name: vars.name || vars.tenantName || '',
    email: vars.email || '',
  };
  return template.replace(/\{\{\s*([a-zA-ZçğıöşüÇĞİÖŞÜ]+)\s*\}\}/g, (match, key: string) => {
    const normalized = key.toLocaleLowerCase('tr-TR').replace(/ş/g, 's').replace(/ı/g, 'i');
    const value = values[normalized];
    if (value === undefined) return match;
    return html ? escapeHtml(value) : value;
  });
}

/** Plain text typed in the panel becomes paragraphs; links stay clickable. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => {
      const escaped = escapeHtml(para.trim()).replace(/\n/g, '<br>');
      const linked = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#4f46e5">$1</a>');
      return linked ? `<p style="margin:0 0 14px">${linked}</p>` : '';
    })
    .join('');
}

/** Branded wrapper used for campaign and notification mails. */
export function wrapEmailLayout(input: { bodyHtml: string; preheader?: string; ctaUrl?: string | null; ctaLabel?: string | null }): string {
  const cta =
    input.ctaUrl && /^https?:\/\//i.test(input.ctaUrl)
      ? `<p style="margin:24px 0 0"><a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">${escapeHtml(input.ctaLabel || 'Detayları Gör')}</a></p>`
      : '';
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.preheader || '')}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:linear-gradient(90deg,#4f46e5,#9333ea);padding:20px 28px;color:#fff;font-weight:900;font-size:18px;letter-spacing:1px">ODIVON</td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6">${input.bodyHtml}${cta}</td></tr>
<tr><td style="padding:16px 28px;background:#f8fafc;color:#64748b;font-size:12px">Bu e-posta Odivon platformu tarafından işletmenize gönderilmiştir. Sorularınız için bu e-postayı yanıtlayabilirsiniz.</td></tr>
</table></td></tr></table></body></html>`;
}
