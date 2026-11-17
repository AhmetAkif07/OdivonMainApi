import { Controller, Get, Param, ParseIntPipe, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { escapeHtml } from '../crm/crm-templates';
import { SalesAssistantService } from './sales-assistant.service';

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/**
 * Teklif e-postalarındaki bağlantılar (giriş gerektirmez): açılma pikseli, tıklama yönlendirmesi,
 * abonelikten çıkma ve demo talep sayfası. Belirteç her teklif için rastgele üretilir.
 */
@ApiExcludeController()
@Controller('public/sales/o/:token')
export class PublicSalesController {
  constructor(private readonly assistant: SalesAssistantService) {}

  @Get('p.gif')
  async pixel(@Param('token') token: string, @Res() res: Response) {
    await this.assistant.recordOpen(token).catch(() => undefined);
    res.set('Cache-Control', 'no-store, max-age=0');
    return res.status(200).type('gif').send(PIXEL);
  }

  @Get('c/:index')
  async click(@Param('token') token: string, @Param('index', ParseIntPipe) index: number, @Res() res: Response) {
    const url = await this.assistant.recordClick(token, index).catch(() => 'https://odivon.com');
    res.redirect(302, url);
  }

  /** GET onay sayfası; e-posta tarayıcıları bağlantıyı açsa da sadece "Evet" ile işlenir. */
  @Get('u')
  async unsubscribe(@Param('token') token: string, @Res() res: Response, @Query('confirm') confirm?: string) {
    if (confirm === '1') {
      const r = await this.assistant.unsubscribe(token);
      return send(res, 
        r.ok ? 'Listeden çıkarıldınız' : 'Bağlantı geçersiz',
        r.ok
          ? '<p>Artık size Odivon tanıtım mesajı göndermeyeceğiz. Yanlışlıkla yaptıysanız bize yazmanız yeterli.</p>'
          : '<p>Bu bağlantı geçersiz ya da süresi dolmuş.</p>',
      );
    }
    return send(res, 
      'Odivon e-postalarından ayrıl',
      `<p>Odivon tanıtım e-posta ve mesajlarını artık almak istemiyor musunuz?</p>
<form method="get"><input type="hidden" name="confirm" value="1" /><button type="submit">Evet, listeden çıkar</button></form>`,
    );
  }

  @Get('demo')
  async demo(
    @Param('token') token: string,
    @Res() res: Response,
    @Query('submit') submit?: string,
    @Query('name') name?: string,
    @Query('phone') phone?: string,
    @Query('when') when?: string,
    @Query('note') note?: string,
  ) {
    if (submit === '1') {
      const r = await this.assistant.requestDemo(token, { name, phone, when, note });
      return send(res, 
        r.ok ? 'Teşekkürler!' : 'Bağlantı geçersiz',
        r.ok
          ? '<p>Demo talebinizi aldık. Ekibimiz en kısa sürede sizi arayarak uygun saati netleştirecek.</p><p><a href="https://odivon.com">odivon.com</a></p>'
          : '<p>Bu bağlantı geçersiz. <a href="https://odivon.com">odivon.com</a> üzerinden bize ulaşabilirsiniz.</p>',
      );
    }
    const ctx = await this.assistant.demoContext(token);
    if (!ctx) return send(res, 'Bağlantı geçersiz', '<p><a href="https://odivon.com">odivon.com</a> üzerinden bize ulaşabilirsiniz.</p>');
    return send(res, 
      `${escapeHtml(ctx.productLabel ? `Odivon ${ctx.productLabel}` : 'Odivon')} ücretsiz demo`,
      `<p>${ctx.leadName ? `<b>${escapeHtml(ctx.leadName)}</b> için ` : ''}15 dakikalık canlı demo ayarlayalım. Bilgilerinizi bırakın, sizi arayalım.</p>
<form method="get">
<input type="hidden" name="submit" value="1" />
<label>Adınız<input name="name" maxlength="80" autocomplete="name" /></label>
<label>Telefon<input name="phone" maxlength="30" inputmode="tel" autocomplete="tel" required /></label>
<label>Size uygun zaman<input name="when" maxlength="80" placeholder="ör. Salı öğleden sonra" /></label>
<label>Not<textarea name="note" maxlength="500" rows="3"></textarea></label>
<button type="submit">Demo talep et</button>
</form>`,
    );
  }
}

function send(res: Response, title: string, body: string) {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  return res.status(200).type('html').send(page(title, body));
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="robots" content="noindex" />
<title>${title}</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f1f5f9;color:#0f172a}
main{max-width:440px;margin:48px auto;padding:28px;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(15,23,42,.08)}
h1{font-size:20px;margin:0 0 12px}p{line-height:1.55;color:#334155}
label{display:block;font-size:13px;color:#475569;margin:12px 0 0}
input,textarea{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit}
button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
a{color:#4f46e5}
</style></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
}
