import { matchesAudience } from './crm-directory.service';
import { render } from './crm-campaigns.service';
import { renderPlaceholders, textToHtml } from './crm-templates';

describe('CRM templates', () => {
  it('fills Turkish and English placeholders and escapes HTML values', () => {
    const out = renderPlaceholders('Merhaba {{ad}}, {{işletme}} / {{tenant}}', { name: '<b>Ali</b>', tenantName: 'Fit & Co' }, true);
    expect(out).toBe('Merhaba &lt;b&gt;Ali&lt;/b&gt;, Fit &amp; Co / Fit &amp; Co');
  });

  it('keeps unknown placeholders untouched', () => {
    expect(renderPlaceholders('{{bilinmeyen}}', {}, false)).toBe('{{bilinmeyen}}');
  });

  it('turns typed text into escaped paragraphs with links', () => {
    const html = textToHtml('Satır 1\nSatır <2>\n\nhttps://odivon.com');
    expect(html).toContain('Satır 1<br>Satır &lt;2&gt;');
    expect(html).toContain('<a href="https://odivon.com"');
  });

  it('renders a campaign for one recipient', () => {
    const out = render(
      { subject: '{{isletme}} için yenilik', body: 'Selam {{ad}}', bodyFormat: 'text', ctaUrl: 'https://odivon.com', ctaLabel: 'Aç' },
      { email: 'a@b.com', name: 'Ayşe', tenantId: 't1', tenantName: 'Spor Salonu' },
    );
    expect(out.subject).toBe('Spor Salonu için yenilik');
    expect(out.text).toBe('Selam Ayşe');
    expect(out.html).toContain('href="https://odivon.com"');
  });
});

describe('matchesAudience', () => {
  const tenant = { id: 't1', modules: ['gym'], status: 'active', isDemo: false, membershipStatus: 'trial' } as const;

  it('defaults to active, non-demo tenants', () => {
    expect(matchesAudience({ ...tenant, modules: ['gym'] }, {})).toBe(true);
    expect(matchesAudience({ ...tenant, modules: ['gym'], isDemo: true }, {})).toBe(false);
    expect(matchesAudience({ ...tenant, modules: ['gym'], status: 'inactive' }, {})).toBe(false);
    expect(matchesAudience({ ...tenant, modules: ['gym'], deletedAt: '2026-01-01' }, { tenantStatus: 'all' })).toBe(false);
  });

  it('filters by module, membership and explicit tenant list', () => {
    const t = { ...tenant, modules: ['gym'] as never[] };
    expect(matchesAudience(t, { modules: ['vet'] })).toBe(false);
    expect(matchesAudience(t, { modules: ['vet', 'gym'] })).toBe(true);
    expect(matchesAudience(t, { membership: ['expired'] })).toBe(false);
    expect(matchesAudience(t, { membership: ['trial'] })).toBe(true);
    expect(matchesAudience(t, { tenantIds: ['t2'] })).toBe(false);
  });
});
