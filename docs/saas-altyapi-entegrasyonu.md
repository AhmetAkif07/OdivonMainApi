# Yeni bir SaaS ürününü yönetim paneline bağlama

Panelde **Sistem > SaaS Altyapı** (`/saas`) her ürünün API'sini, Firebase projesini, canlılığını ve
müşterilerini gösterir. **SaaS Üyelikler** (`/saas/memberships`) tüm ürünlerin müşterilerinin
deneme / abonelik durumunu tek listede toplar. Tarayıcı harici API'lere hiç gitmez; tüm çağrıları
MainApi yapar ve tokenlar yalnız MainApi'nin ortam değişkeninde durur.

## 1. Panelde kaydı açın

`/saas` > **+ Altyapı ekle**:

| Alan | Örnek | Not |
|---|---|---|
| Kimlik | `pairly` | Küçük harf, rakam, tire. Token anahtarı da bu olur. |
| API kökü | `https://api.pairly.com` | Gösterim için. |
| Sağlık adresi | `https://api.pairly.com/healthz` | GET; 2xx = çalışıyor, >2,5 sn = yavaş. JSON dönerse `version`, `revision` okunur. |
| Web uygulaması | `https://app.pairly.com` | `/version.json` içindeki `version` / `release` gösterilir. |
| Firebase proje kimliği | `pairly-12345` | Konsol bağlantısı için. |
| Müşteri verisi | **Harici API** | Müşteri ve üyelik listesi için gerekli. |
| Müşteri listesi adresi | `https://api.pairly.com/internal/platform/tenants` | Aşağıdaki sözleşmeye uyan uç. |

## 2. Servis tokenını MainApi'ye ekleyin

Ürün API'si ile MainApi arasında paylaşılan uzun, rastgele bir token üretin (en az 32 karakter) ve
MainApi'de `PLATFORM_BACKEND_TOKENS` secret'ına kimlik anahtarıyla ekleyin:

```bash
# Tüm tokenlar tek JSON; mevcut "erp" tokenını da yeniden yazın.
npx wrangler secret put PLATFORM_BACKEND_TOKENS
# değer: {"erp":"<erp-token>","pairly":"<pairly-token>"}
```

Aynı tokenı ürün API'sinde de secret olarak tutun; Firestore'a, koda veya tarayıcıya yazmayın.

## 3. Ürün API'sinde iki uç açın

Her istek `Authorization: Bearer <token>` taşır. Token yanlışsa `401` dönün.

### `GET {tenantsUrl}` — müşteri listesi

```json
{
  "items": [
    {
      "id": "t_123",
      "name": "Örnek Ltd.",
      "status": "active",
      "modules": ["pos", "muhasebe"],
      "ownerUid": "uid_abc",
      "ownerEmail": "sahip@ornek.com",
      "memberCount": 4,
      "companyCount": 1,
      "createdAt": "2026-09-01T10:00:00.000Z",
      "statusChangedAt": null,
      "statusReason": null,
      "isDemo": false,
      "subscription": {
        "plan": "pro",
        "planName": "Pro Paket",
        "status": "active",
        "billingCycle": "monthly",
        "startedAt": "2026-10-01T00:00:00.000Z",
        "trialEndsAt": null,
        "currentPeriodEnd": "2026-12-01T00:00:00.000Z",
        "amount": 2990,
        "currency": "TRY",
        "autoRenew": false
      }
    }
  ],
  "summary": { "total": 1, "active": 1, "suspended": 0, "closed": 0, "members": 4 },
  "generatedAt": "2026-11-26T12:00:00.000Z"
}
```

- `status` (hesap): `active` | `suspended` | `closed`.
- `subscription` **isteğe bağlıdır**; yoksa müşteri "Üyelik yok" görünür ve panel "subscription alanı
  eklenmemiş" uyarısı verir.
- `subscription.status`: `trial` | `active` | `past_due` | `expired` | `cancelled` | `none`
  (`trialing`, `canceled`, `unpaid` gibi yaygın eşanlamlılar da kabul edilir).
- Tarihler ISO 8601. `status` "active"/"trial" olsa da bitiş tarihi geçmişse panel "Süresi doldu" sayar.
- `amount` dönem tutarıdır (yıllık planda yıllık tutar); panel aylık tekrarlayan geliri yıllık / 12 ile hesaplar.
- Yanıt 12 saniye içinde gelmeli. Çok büyük listelerde (binlerce müşteri) sayfalama yerine yalnız
  gereken alanları döndürün.

### `POST {tenantsUrl}/{tenantId}/status` — askıya al / aç / kapat

İstek gövdesi `{ "status": "active" | "suspended" | "closed", "reason": "..." | null }`.
Başarıda `2xx`, kiracı yoksa `404`. Askıya alınan kiracının kullanıcıları en geç 30 saniye içinde
erişimi kaybetmelidir.

## API'si olmayan (yalnız Firebase kullanan) ürünler

School ve FaturaPro gibi doğrudan Firebase kullanan ürünlerde, aynı sözleşmeyi tek bir HTTPS
Cloud Function ile açmak yeterli. Ardından kaydın "Müşteri verisi" alanını **Harici API** yapın.

```ts
// functions/src/platform.ts (Firebase Functions v2)
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';

const PLATFORM_TOKEN = defineSecret('PLATFORM_TOKEN');

export const platformTenants = onRequest({ secrets: [PLATFORM_TOKEN], region: 'europe-west1' }, async (req, res) => {
  if (req.get('authorization') !== `Bearer ${PLATFORM_TOKEN.value()}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const db = getFirestore();
  const snap = await db.collection('tenants').get(); // ürünün kendi koleksiyon adı
  const items = snap.docs.map((d) => {
    const t = d.data();
    return {
      id: d.id,
      name: t.name ?? d.id,
      status: t.status === 'inactive' ? 'suspended' : (t.status ?? 'active'),
      modules: t.modules ?? [],
      ownerUid: t.ownerUid ?? '',
      ownerEmail: t.ownerEmail ?? null,
      memberCount: t.memberCount ?? 0,
      companyCount: 1,
      createdAt: t.createdAt ?? null,
      statusChangedAt: null,
      statusReason: null,
      subscription: {
        plan: t.planId ?? null,
        status: t.membershipStatus ?? 'none',
        trialEndsAt: t.trialEndsAt ?? null,
        currentPeriodEnd: t.subscriptionEndsAt ?? null,
        billingCycle: t.billingCycle ?? null,
      },
    };
  });
  const count = (s: string) => items.filter((i) => i.status === s).length;
  res.json({
    items,
    summary: { total: items.length, active: count('active'), suspended: count('suspended'), closed: count('closed'),
      members: items.reduce((n, i) => n + i.memberCount, 0) },
    generatedAt: new Date().toISOString(),
  });
});
```

Müşteri listesi adresi bu durumda
`https://europe-west1-<proje>.cloudfunctions.net/platformTenants` olur; durum değiştirme ucu
istenirse aynı fonksiyonda `POST /{id}/status` yolu ele alınır.

## Kontrol listesi

- [ ] Panelde kayıt açıldı, "Müşteri verisi" = Harici API, liste adresi girildi.
- [ ] `PLATFORM_BACKEND_TOKENS` içine `"<kimlik>": "<token>"` eklendi (diğer tokenlar korunarak).
- [ ] Ürün API'si `GET` listesi ve `POST .../status` ucunu açtı, yanlış token için 401 dönüyor.
- [ ] Kayıtlara `subscription` alanı eklendi; `/saas/memberships` sayfasında altyapı kartında uyarı yok.
