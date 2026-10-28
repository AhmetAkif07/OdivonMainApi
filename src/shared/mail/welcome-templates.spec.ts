import { buildModuleWelcomeEmail, MODULE_WELCOME_CONTENT, WelcomeModule } from './welcome-templates';

describe('buildModuleWelcomeEmail', () => {
  const modules = Object.keys(MODULE_WELCOME_CONTENT) as WelcomeModule[];

  it.each(modules)('builds a %s welcome mail with its own brand', (module) => {
    const { brand, subject, html } = buildModuleWelcomeEmail({
      module,
      to: 'owner@example.com',
      displayName: 'Ayşe',
      tenantName: 'Deneme İşletmesi',
    });
    expect(brand).toBe(MODULE_WELCOME_CONTENT[module].brand);
    expect(subject).toContain(brand);
    expect(subject).toContain('Deneme İşletmesi');
    expect(html).toContain(MODULE_WELCOME_CONTENT[module].badge);
    expect(html).toContain('Sayın Ayşe,');
    expect(html).not.toContain('OdivonGYM');
  });

  it('escapes user-supplied values', () => {
    const { subject, html } = buildModuleWelcomeEmail({
      module: 'vet',
      to: '"><img src=x onerror=alert(1)>@example.com',
      displayName: '<script>alert(1)</script>',
      tenantName: '<b>Klinik</b> & "Pati"\r\nBcc: x@example.com',
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>Klinik</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;Klinik&lt;/b&gt; &amp; &quot;Pati&quot;');
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it('shows the trial and the panel button only when given', () => {
    const base = { module: 'hair' as const, to: 'owner@example.com', tenantName: 'Salon' };
    const plain = buildModuleWelcomeEmail(base).html;
    expect(plain).not.toContain('Deneme Süresi');
    expect(plain).not.toContain('Yönetim Paneline Giriş Yap');
    expect(plain).toContain('Sayın Salon Yöneticisi,');

    const full = buildModuleWelcomeEmail({ ...base, trialDays: 14, loginUrl: 'https://example.com/auth/login' }).html;
    expect(full).toContain('14 Gün');
    expect(full).toContain('href="https://example.com/auth/login"');

    expect(buildModuleWelcomeEmail({ ...base, loginUrl: 'javascript:alert(1)' }).html).not.toContain('javascript:');
  });
});
