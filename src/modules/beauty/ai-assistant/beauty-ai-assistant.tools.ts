import type Anthropic from '@anthropic-ai/sdk';

/**
 * Asistanın kullanabildiği araçlar. Hepsi salonun online randevu (public booking) akışının
 * aynısını çağırır; böylece AI'ın gördüğü hizmet, uzman ve boş saatler müşterinin linkte
 * gördüğüyle birebir aynıdır.
 */
export const AI_ASSISTANT_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'get_salon_info',
    description:
      'Salonun adı, şubesi, adresi, telefonu, çalışma günleri (0=Pazar, 1=Pazartesi ... 6=Cumartesi) ve çalışma saatlerini getirir.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: 'list_services',
    description:
      'Online randevuya açık hizmetleri listeler: id, ad, açıklama, süre (dakika) ve fiyat (TL, null ise fiyat salonda söylenir). Müşteri bir hizmetten bahsettiğinde doğru service_id için önce bunu çağır.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: 'list_staff',
    description:
      'Belirli hizmeti verebilen uzmanları listeler. Müşteri belirli bir uzman isterse staff_id bulmak için kullan.',
    input_schema: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'list_services sonucundaki hizmet id' },
      },
      required: ['service_id'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'find_available_slots',
    description:
      'Bir gün için hizmetin boş başlangıç saatlerini (HH:MM) getirir. Saat önermeden önce mutlaka bunu çağır; kendi kafana göre saat uydurma.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        service_id: { type: 'string' },
        staff_id: {
          type: ['string', 'null'],
          description: 'Belirli uzman istendiyse id, yoksa null',
        },
      },
      required: ['date', 'service_id', 'staff_id'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'book_appointment',
    description:
      'Randevuyu oluşturur. Sadece müşteri hizmet, tarih ve saati açıkça onayladıktan, ad soyad ve telefonunu verdikten ve KVKK aydınlatma metnini kabul ettiğini söyledikten sonra çağır.',
    input_schema: {
      type: 'object',
      properties: {
        service_id: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:MM, find_available_slots sonucundan' },
        staff_id: { type: ['string', 'null'], description: 'Belirli uzman yoksa null' },
        full_name: { type: 'string' },
        phone: {
          type: ['string', 'null'],
          description: 'Müşterinin telefonu. WhatsApp konuşmasında null bırakılırsa yazan numara kullanılır.',
        },
        notes: { type: ['string', 'null'] },
        kvkk_consent: {
          type: 'boolean',
          description: 'Müşteri kişisel verilerinin randevu için işlenmesini açıkça kabul ettiyse true',
        },
      },
      required: ['service_id', 'date', 'time', 'staff_id', 'full_name', 'phone', 'notes', 'kvkk_consent'],
      additionalProperties: false,
    },
    strict: true,
  },
];

export const AI_ASSISTANT_SYSTEM_PROMPT = `Sen bir güzellik salonunun online randevu asistanısın. Müşterilerle WhatsApp, Instagram veya web sohbeti üzerinden Türkçe konuşursun.

Görevin:
- Müşterinin istediği hizmeti anlamak, uygun gün ve saati bulmak ve randevuyu oluşturmak.
- Hizmetler, fiyatlar, süreler, çalışma saatleri ve adres hakkındaki soruları araçlardan gelen bilgiyle cevaplamak.

Kurallar:
- Bilgiyi her zaman araçlardan al. Hizmet, fiyat, uzman veya boş saat uydurma. Araç sonucunda olmayan bir şeyi bilmediğini söyle ve salonun telefonunu ver.
- Saat önermeden önce find_available_slots çağır. Çok seçenek varsa en fazla 4-5 saat öner; müşteri sabah/öğleden sonra gibi tercih belirttiyse ona göre süz.
- "Yarın", "cumartesi", "haftaya" gibi ifadeleri aşağıda verilen bugünün tarihine göre YYYY-MM-DD'ye çevir. Geçmiş bir tarihe randevu verme.
- Randevu oluşturmadan önce şunları topla: hizmet, tarih, saat, ad soyad, telefon (WhatsApp'ta gerek yok) ve KVKK onayı. KVKK için şunu sor: "Randevunuz için adınızı ve telefonunuzu salonla paylaşmamızı onaylıyor musunuz?" Müşteri evet demeden kvkk_consent true gönderme.
- Oluşturmadan önce özeti tek mesajda göster (hizmet, gün, saat, uzman varsa) ve onay iste. Onay gelince book_appointment çağır.
- Randevu oluşunca kısa bir onay mesajı yaz: gün, saat, hizmet ve salon adresi. Randevunun salon tarafından onaylanacağını belirt.
- Seçilen saat dolduysa özür dile ve en yakın boş saatleri öner.
- Tıbbi teşhis koyma, ilaç önerme. Randevu ve salonla ilgisi olmayan konularda nazikçe konuya dön.
- Kısa, sıcak ve samimi yaz; "siz" diye hitap et. Bir mesajda en fazla bir soru sor. Markdown başlığı ya da tablo kullanma, düz metin ve gerekirse kısa liste yaz.`;
