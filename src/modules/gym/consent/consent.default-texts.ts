import { ConsentType } from './consent.dto';

export interface ConsentTextDefinition {
  type: ConsentType;
  title: string;
  version: string;
  isRequired: boolean;
  isActive: boolean;
  contentHtml: string;
}

export const DEFAULT_CONSENT_TEXTS: ConsentTextDefinition[] = [
  {
    type: 'kvkk_general',
    title: 'KVKK Genel Aydınlatma ve Açık Rıza Metni',
    version: '1.0',
    isRequired: true,
    isActive: true,
    contentHtml: `
      <p>6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) uyarınca, veri sorumlusu sıfatıyla spor salonumuz tarafından kişisel verileriniz (kimlik, iletişim, üyelik bilgileri), hizmet sözleşmesinin ifası, tesis güvenliği, yasal yükümlülüklerin yerine getirilmesi amacıyla işlenmektedir.</p>
      <p>Verileriniz mevzuatın izin verdiği ölçüde resmi kurumlara ve yetkili iş ortaklarına aktarılabilecektir. KVKK'nın 11. maddesi kapsamındaki haklarınızı dilediğiniz zaman salon yönetimine başvurarak kullanabilirsiniz.</p>
    `.trim(),
  },
  {
    type: 'commercial_communication',
    title: 'Ticari Elektronik İleti Onayı (SMS / E-posta)',
    version: '1.0',
    isRequired: false,
    isActive: true,
    contentHtml: `
      <p>Spor salonumuza ait kampanya, indirim, etkinlik, yeni paket duyuruları ve özel fırsatların SMS, e-posta ve sesli arama kanalları üzerinden tarafıma iletilmesine, 6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun kapsamında açık rıza veriyorum.</p>
    `.trim(),
  },
  {
    type: 'health_biometric',
    title: 'Özel Nitelikli Sağlık Verisi ve Vücut Ölçüm Rızası',
    version: '1.0',
    isRequired: false,
    isActive: true,
    contentHtml: `
      <p>Kişiye özel antrenman ve beslenme programlarının hazırlanması, spor yapmaya engel sağlık durumlarının tespiti ve gelişim takibinin yapılabilmesi amacıyla; sağlık beyanı, kronik hastalık, alerji ve vücut analiz verilerimin antrenörler ve ilgili yetkili personel tarafından işlenmesine açık rıza veriyorum.</p>
    `.trim(),
  },
  {
    type: 'camera_cctv',
    title: 'Tesis İçi Güvenlik Kameraları Aydınlatma Metni',
    version: '1.0',
    isRequired: false,
    isActive: true,
    contentHtml: `
      <p>Tesis güvenliğinin, üye ve personelin can ve mal emniyetinin sağlanması amacıyla tesisin ortak alanlarında (soyunma odaları ve tuvaletler hariç) 7/24 kapalı devre kamera (CCTV) ile kayıt yapılmaktadır. Görüntüler yasal saklama süreleri sonunda otomatik olarak silinmektedir.</p>
    `.trim(),
  },
];
