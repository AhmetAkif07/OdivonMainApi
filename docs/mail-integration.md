# OdivonGYM E-Posta (Mail) Entegrasyonu ve Hoş Geldiniz Bildirimi

Bu doküman, Odivon SaaS platformunda (`OdivonGYM` frontend ve `OdivonMainApi` backend) hayata geçirilen Hostinger SMTP tabanlı otomatik e-posta gönderim mimarisini ve "Hoş Geldiniz" maili entegrasyonunu açıklamaktadır.

---

## 1. Genel Bakış ve Amaç

OdivonGYM'e yeni kayıt olan işletme/salon sahiplerine (`role: owner`), hesapları oluşturulduğu anda kurumsal kimliğe uygun bir **"Hoş Geldiniz"** e-postası gönderilir. 

- **Gönderici Adresi:** `info@odivon.com` ("OdivonGYM")
- **Kapsam:** Yalnızca OdivonGYM SaaS kaydı gerçekleştiren salon sahipleri.
- **Tetiklenme Noktası:** Backend tarafındaki `IdentityService.register()` metodu (Tenant ve yetki tanımları tamamlandıktan hemen sonra).

---

## 2. Mimari Yapı ve Dosyalar

Tüm mail altyapısı NestJS modüler yapısına uygun olarak `OdivonMainApi` projesinde `shared/mail` altında konumlandırılmıştır:

```
OdivonMainApi/
├── src/
│   ├── shared/
│   │   └── mail/
│   │       ├── mail.service.ts       # SMTP istemcisi, HTML şablonu ve gönderim metotları
│   │       ├── mail.module.ts        # MailModule (MailService provider ve export)
│   │       └── mail.service.spec.ts  # SMTP fallback & hata dayanıklılık unit testleri
│   └── modules/
│       └── identity/
│           ├── identity.module.ts    # MailModule import edildi
│           ├── identity.service.ts   # register() metodunda asenkron mail tetikleme
│           └── identity.service.spec.ts
├── .env.example                      # SMTP şablon değişkenleri
└── .env                              # Canlı/Lokal SMTP kimlik bilgileri
```

---

## 3. SMTP ve Ortam Değişkenleri (.env)

E-posta gönderimi **Hostinger SMTP** sunucuları üzerinden SSL (Port 465) veya TLS (Port 587) protokolüyle çalışır.

### Gerekli Ortam Değişkenleri

`OdivonMainApi/.env` dosyasına aşağıdaki değişkenler eklenmiştir:

```ini
# ==========================================
# Hostinger SMTP (OdivonGYM E-posta Servisi)
# ==========================================
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=info@odivon.com
SMTP_PASS=BURAYA_HOSTINGER_EPOSTA_SIFRENIZI_YAZIN
SMTP_FROM="OdivonGYM" <info@odivon.com>
APP_URL=https://odivongym.app
```

> [!WARNING]
> **Güvenlik Uyarısı:** E-posta şifresi (`SMTP_PASS`) kesinlikle Git kaynak kodlarına, PR açıklamalarına veya sohbet ekranlarına eklenmemelidir. Sadece sunucu ortamındaki `.env` dosyası içinde tutulmalıdır.

---

## 4. E-posta Şablonu Tasarımı (HTML & UX)

Hoş geldiniz e-postası, OdivonGYM'in modern karanlık arayüz (Dark Mode) tasarım diline uygun olarak hazırlanmıştır:

1. **Header & Marka Rozeti:**  
   - Degrade mor/indigo arka plan (`linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)`).
   - "SPOR SALONU YÖNETİM PLATFORMU - Aramıza Hoş Geldiniz! 🏋️‍♂️" başlığı.
2. **Kişiselleştirilmiş Selamlama:**  
   - Salon yöneticisinin adı (`displayName` veya varsayılan olarak "Salon Yöneticisi").
   - Salon/İşletme adı (`tenantName`).
3. **Deneme Süresi & Hesap Kartı:**  
   - Salon Adı, Yönetici E-postası ve **14 Günlük Ücretsiz Tam Sürüm** rozeti (Kredi kartı gerekmez ibaresiyle).
4. **Hızlı Başlangıç Rehberi:**  
   - Şube & Antrenman Alanları tanımlama.
   - Üyelik Paketleri belirleme.
   - Turnike & Mobil QR Geçiş donanım entegrasyonu.
5. **CTA Butonu (Giriş Yap):**  
   - Yönetim paneline doğrudan yönlendiren "Yönetim Paneline Giriş Yap →" butonu (`APP_URL/auth/login`).
6. **Footer & Destek İletişimi:**  
   - Destek kanalı `info@odivon.com` ve telif hakkı bildirimleri.

---

## 5. Hata Yönetimi ve Dayanıklılık (Fault Tolerance)

Kullanıcı kayıt akışının sürekliliği için e-posta gönderimi **"Non-blocking / Fire-and-Forget"** prensibiyle kurgulanmıştır:

- **Eksik Şifre Durumu:** Eğer `.env` içerisinde `SMTP_PASS` tanımlı değilse, sistem kullanıcıya veya konsola patlamaz; `MailService` bir uyarı logu düşer ve kaydı başarıyla tamamlar.
- **SMTP Sunucu Kesintisi:** Hostinger SMTP sunucusuna erişilemediğinde veya geçici bir ağ hatası olduğunda `.catch()` bloğu hatayı loglar, ancak kullanıcının üyelik ve tenant oluşturma süreci kesintiye uğramaz.

---

## 6. Test ve Doğrulama Komutları

Entegrasyonun ve testlerin doğrulanması için aşağıdaki komutlar kullanılabilir:

```bash
# Mail servisi birim testleri
npm test src/shared/mail/mail.service.spec.ts

# Kayıt ve kimlik servisi testleri
npm test src/modules/identity/identity.service.spec.ts

# NestJS build kontrolü
npm run build
```
