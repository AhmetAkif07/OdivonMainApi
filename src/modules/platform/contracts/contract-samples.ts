import { ProductModule } from '../../../shared/authorization/constants';
import { PRODUCT_LABELS } from '../tickets/ticket-grouping';
import {
  CLAUSE_CATEGORIES,
  CONTRACT_KIND_LABELS,
  ClauseCategory,
  ContractClause,
  ContractKind,
  ContractProduct,
} from './contract.types';

/**
 * ÖRNEK sözleşme maddeleri kütüphanesi.
 *
 * Buradaki metinler başlangıç taslağıdır; 6502 sayılı Tüketicinin Korunması Hakkında Kanun,
 * Mesafeli Sözleşmeler Yönetmeliği, 6098 sayılı TBK ve 6698 sayılı KVKK'daki genel ilkelere göre
 * yazılmıştır ama hukuki görüş değildir. Yayına almadan önce bir avukata kontrol ettirilmelidir.
 */
export const SAMPLE_DISCLAIMER =
  'Bu metin örnek taslaktır ve hukuki görüş yerine geçmez. Yayına almadan önce bir hukukçuya kontrol ettirin.';

/** Sözleşme metinlerinde kullanılabilen yer tutucular. */
export const CONTRACT_PLACEHOLDERS: { key: string; label: string; group: 'seller' | 'buyer' | 'product' | 'other' }[] = [
  { key: 'satici_unvan', label: 'Satıcı ticari unvanı', group: 'seller' },
  { key: 'satici_kisa_ad', label: 'Satıcı kısa adı (Odivon)', group: 'seller' },
  { key: 'satici_adres', label: 'Satıcı adresi', group: 'seller' },
  { key: 'satici_vergi_dairesi', label: 'Satıcı vergi dairesi', group: 'seller' },
  { key: 'satici_vergi_no', label: 'Satıcı vergi no', group: 'seller' },
  { key: 'satici_mersis', label: 'Satıcı MERSİS no', group: 'seller' },
  { key: 'satici_eposta', label: 'Satıcı e-posta', group: 'seller' },
  { key: 'satici_telefon', label: 'Satıcı telefon', group: 'seller' },
  { key: 'satici_kep', label: 'Satıcı KEP adresi', group: 'seller' },
  { key: 'satici_web', label: 'Satıcı web sitesi', group: 'seller' },
  { key: 'yetkili_mahkeme', label: 'Yetkili mahkeme / icra daireleri', group: 'other' },
  { key: 'alici_unvan', label: 'Alıcı (işletme) unvanı', group: 'buyer' },
  { key: 'alici_adres', label: 'Alıcı adresi', group: 'buyer' },
  { key: 'alici_vergi_no', label: 'Alıcı vergi / TC kimlik no', group: 'buyer' },
  { key: 'alici_eposta', label: 'Alıcı e-posta', group: 'buyer' },
  { key: 'alici_telefon', label: 'Alıcı telefon', group: 'buyer' },
  { key: 'urun_adi', label: 'Ürün adı (ör. Odivon Spor Salonu)', group: 'product' },
  { key: 'paket_adi', label: 'Paket adı', group: 'product' },
  { key: 'fiyat', label: 'Paket fiyatı (KDV dahil)', group: 'product' },
  { key: 'odeme_donemi', label: 'Ödeme dönemi (aylık / yıllık)', group: 'product' },
  { key: 'tarih', label: 'Sözleşme tarihi', group: 'other' },
  { key: 'surum', label: 'Sözleşme sürümü', group: 'other' },
];

export interface SampleClause {
  id: string;
  title: string;
  category: ClauseCategory;
  body: string;
  /** Hangi sözleşme türlerinde önerilir. */
  kinds: ContractKind[];
  /** Boşsa tüm ürünlerde geçerli; doluysa sadece bu ürünlere özel madde. */
  products?: ProductModule[];
}

const COMPLIANCE_PRODUCTS: ProductModule[] = [
  'fgas',
  'machine-ce',
  'food-label',
  'product-safe',
  'fire-safe',
  'pay-fair',
  'cargo-docs',
  'cyber-ready',
];

const SALES_LIKE: ContractKind[] = ['sales', 'distance_sales'];

export const SAMPLE_CLAUSES: SampleClause[] = [
  // ---- Taraflar / konu --------------------------------------------------------------------
  {
    id: 'gen:taraflar',
    title: 'Taraflar',
    category: 'parties',
    kinds: ['sales', 'distance_sales', 'data_processing', 'sla'],
    body:
      'İşbu sözleşme; {{satici_adres}} adresinde mukim, {{satici_vergi_dairesi}} Vergi Dairesi {{satici_vergi_no}} vergi numaralı, MERSİS No: {{satici_mersis}} olan {{satici_unvan}} ("{{satici_kisa_ad}}" veya "Hizmet Sağlayıcı") ile ' +
      '{{alici_adres}} adresinde mukim {{alici_vergi_no}} vergi / T.C. kimlik numaralı {{alici_unvan}} ("Müşteri") arasında, aşağıdaki şartlarla elektronik ortamda kurulmuştur.\n' +
      'Hizmet Sağlayıcı iletişim: {{satici_eposta}} · {{satici_telefon}} · KEP: {{satici_kep}}',
  },
  {
    id: 'gen:konu',
    title: 'Sözleşmenin Konusu',
    category: 'subject',
    kinds: SALES_LIKE,
    body:
      'Sözleşmenin konusu, {{urun_adi}} bulut tabanlı yazılım hizmetinin ("Hizmet") {{paket_adi}} paketi kapsamında, abonelik süresi boyunca Müşteri’nin kullanımına sunulmasına ilişkin tarafların hak ve yükümlülüklerinin belirlenmesidir. ' +
      'Hizmet, yazılımın mülkiyetinin devri değil; süreli, devredilemez ve münhasır olmayan bir kullanım hakkının tanınmasıdır.',
  },
  {
    id: 'gen:tanimlar',
    title: 'Tanımlar',
    category: 'subject',
    kinds: ['sales', 'terms_of_use', 'data_processing'],
    body:
      'Hizmet: {{urun_adi}} web ve mobil uygulamaları ile bunlara bağlı API ve altyapı.\n' +
      'Müşteri Verisi: Müşteri’nin veya kullanıcılarının Hizmet’e girdiği, yüklediği ya da Hizmet aracılığıyla oluşturduğu tüm veriler.\n' +
      'Kullanıcı: Müşteri’nin Hizmet’e erişim yetkisi verdiği çalışanları ve yetkilileri.\n' +
      'Son Kullanıcı: Müşteri’nin kendi müşterileri, üyeleri veya danışanları.',
  },

  // ---- Odivon yükümlülükleri --------------------------------------------------------------
  {
    id: 'gen:odivon-yukumluluk',
    title: 'Hizmet Sağlayıcının Yükümlülükleri',
    category: 'provider_obligations',
    kinds: ['sales', 'sla'],
    body:
      '{{satici_kisa_ad}}; Hizmet’i makul özen ve sektördeki yaygın teknik standartlara uygun şekilde sunmayı, planlı bakım çalışmalarını mümkün olduğunca önceden duyurmayı, ' +
      'Müşteri Verisi’ni yetkisiz erişime karşı korumak için 6698 sayılı KVKK md. 12’de öngörülen idari ve teknik tedbirleri almayı ve destek taleplerine iş günlerinde makul sürede dönüş yapmayı taahhüt eder.',
  },
  {
    id: 'gen:yedekleme',
    title: 'Yedekleme ve Veri Erişimi',
    category: 'provider_obligations',
    kinds: ['sales', 'sla', 'data_processing'],
    body:
      'Müşteri Verisi düzenli olarak yedeklenir. Müşteri, abonelik süresince ve sona ermesinden itibaren 30 gün içinde verilerini dışa aktarma talebinde bulunabilir. ' +
      'Bu sürenin sonunda veriler, mevzuatın saklanmasını zorunlu kıldığı kayıtlar hariç olmak üzere silinir veya anonim hâle getirilir.',
  },

  // ---- Müşteri yükümlülükleri -------------------------------------------------------------
  {
    id: 'gen:musteri-yukumluluk',
    title: 'Müşterinin Yükümlülükleri',
    category: 'customer_obligations',
    kinds: ['sales', 'terms_of_use'],
    body:
      'Müşteri; kayıt sırasında verdiği bilgilerin doğru ve güncel olduğunu, kullanıcı adı ve şifrelerin gizliliğinden ve kendi kullanıcılarının işlemlerinden sorumlu olduğunu, ' +
      'Hizmet’i yürürlükteki mevzuata, genel ahlaka ve üçüncü kişilerin haklarına aykırı amaçlarla kullanmayacağını, Hizmet’i tersine mühendislik, yetkisiz erişim veya aşırı yük oluşturacak şekilde kullanmayacağını kabul eder.',
  },
  {
    id: 'gen:musteri-veri-sorumlusu',
    title: 'Son Kullanıcılara Karşı Sorumluluk',
    category: 'customer_obligations',
    kinds: ['sales', 'data_processing'],
    body:
      'Müşteri, Hizmet’e girdiği Son Kullanıcı verileri bakımından KVKK kapsamında veri sorumlusudur. Son Kullanıcılara aydınlatma yapmak, gerekli açık rızaları almak, ' +
      'VERBİS kaydı yükümlülüğü varsa yerine getirmek ve Son Kullanıcı başvurularını cevaplamak Müşteri’nin sorumluluğundadır. Müşteri ile Son Kullanıcıları arasındaki sözleşme ve ticari ilişkilerden {{satici_kisa_ad}} taraf veya sorumlu değildir.',
  },
  {
    id: 'gen:ileti-iys',
    title: 'Ticari Elektronik İleti',
    category: 'customer_obligations',
    kinds: ['sales', 'terms_of_use'],
    body:
      'Hizmet üzerinden gönderilen SMS, e-posta ve WhatsApp mesajlarının içeriği ile alıcıların onayı Müşteri’nin sorumluluğundadır. Müşteri, 6563 sayılı Kanun ve Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik uyarınca ' +
      'İleti Yönetim Sistemi (İYS) kaydı ve onay yükümlülüklerini yerine getireceğini kabul eder.',
  },

  // ---- Ücret ve ödeme ---------------------------------------------------------------------
  {
    id: 'gen:ucret',
    title: 'Ücret ve Ödeme',
    category: 'payment',
    kinds: ['sales', 'distance_sales', 'pre_information'],
    body:
      '{{paket_adi}} paketinin bedeli {{odeme_donemi}} {{fiyat}} TL’dir (KDV dahil). Ödeme, kredi/banka kartı ile PayTR altyapısı üzerinden peşin alınır; kart bilgileri {{satici_kisa_ad}} tarafından saklanmaz. ' +
      'Abonelik otomatik yenilenmez; süre sonunda Müşteri yeni dönem ödemesini yapmadığı takdirde hesap salt okunur moda alınabilir. Fiyat değişiklikleri yeni ödeme dönemi için geçerli olur, ödenmiş dönemler etkilenmez.',
  },
  {
    id: 'gen:fatura',
    title: 'Faturalandırma',
    category: 'payment',
    kinds: ['sales', 'distance_sales'],
    body:
      'Fatura, ödeme tarihinde Müşteri’nin kayıtlı bilgilerine göre e-Fatura / e-Arşiv fatura olarak düzenlenir ve {{alici_eposta}} adresine gönderilir. Fatura bilgilerinin doğruluğundan Müşteri sorumludur.',
  },

  // ---- Sorumluluğun sınırlandırılması (örnek yasal sorumluluk hükümleri) -----------------
  {
    id: 'gen:sorumluluk-siniri',
    title: 'Sorumluluğun Sınırı',
    category: 'liability',
    kinds: ['sales', 'terms_of_use', 'sla'],
    body:
      '{{satici_kisa_ad}}’un bu sözleşmeden doğan toplam sorumluluğu, zararın doğduğu tarihten önceki son 12 ayda Müşteri’nin fiilen ödediği abonelik bedeli ile sınırlıdır. ' +
      'Kâr kaybı, itibar kaybı, veri kaybından doğan dolaylı zararlar ve üçüncü kişilerin talepleri bu sorumluluk kapsamında değildir. ' +
      'Bu sınırlama, 6098 sayılı TBK md. 115 uyarınca kast veya ağır ihmal hâllerinde ve kişilerin hayatı ile sağlığına verilen zararlarda uygulanmaz.',
  },
  {
    id: 'gen:hizmet-garantisi',
    title: 'Hizmetin Sunuluş Biçimi',
    category: 'liability',
    kinds: ['sales', 'terms_of_use'],
    body:
      'Hizmet "olduğu gibi" ve "mevcut olduğu ölçüde" sunulur. {{satici_kisa_ad}}, Hizmet’in kesintisiz veya hatasız olacağını, Müşteri’nin özel ihtiyaçlarının tamamını karşılayacağını garanti etmez; ' +
      'ancak bildirilen hataları makul sürede gidermek için gerekli çabayı gösterir.',
  },
  {
    id: 'gen:ucuncu-taraf',
    title: 'Üçüncü Taraf Hizmetleri',
    category: 'liability',
    kinds: ['sales', 'terms_of_use'],
    body:
      'Hizmet; ödeme kuruluşları, SMS/e-posta sağlayıcıları, bulut altyapısı ve harita gibi üçüncü taraf servislerle entegre çalışabilir. Bu servislerdeki kesinti, fiyat değişikliği veya hatalardan {{satici_kisa_ad}} sorumlu değildir; ' +
      'Müşteri bu servisleri kullanırken ilgili sağlayıcının koşullarına da tabidir.',
  },
  {
    id: 'gen:musteri-verisi-dogrulugu',
    title: 'Girilen Verilerin Doğruluğu',
    category: 'liability',
    kinds: ['sales', 'terms_of_use'],
    body:
      'Hizmet’in ürettiği raporlar, hesaplamalar ve hatırlatmalar Müşteri’nin girdiği verilere dayanır. Hatalı veya eksik veri girişinden doğan sonuçlardan ve bu sonuçlara dayanılarak alınan ticari kararlardan Müşteri sorumludur.',
  },
  {
    id: 'gen:tazmin',
    title: 'Tazmin Yükümlülüğü',
    category: 'liability',
    kinds: ['sales', 'terms_of_use'],
    body:
      'Müşteri’nin bu sözleşmeye veya mevzuata aykırı kullanımı nedeniyle {{satici_kisa_ad}}’a yöneltilen idari para cezaları, üçüncü kişi talepleri ve makul avukatlık ücretleri Müşteri tarafından tazmin edilir.',
  },

  // ---- Ürüne özel sorumluluk maddeleri ----------------------------------------------------
  {
    id: 'gym:saglik-verisi',
    title: 'Üye Sağlık Bilgileri',
    category: 'data_protection',
    kinds: ['sales', 'data_processing'],
    products: ['gym'],
    body:
      'Üyelerin sağlık beyanı, vücut ölçümleri ve benzeri bilgiler KVKK md. 6 uyarınca özel nitelikli kişisel veri sayılabilir. Bu verileri Hizmet’e girmeden önce üyeden açık rıza almak Müşteri’nin sorumluluğundadır. ' +
      'Antrenman ve beslenme programları bilgilendirme amaçlıdır; üyenin sağlık durumuna uygunluğunu değerlendirmek Müşteri’nin ve yetkili eğitmen/hekimin sorumluluğundadır.',
  },
  {
    id: 'gym:gecis-donanim',
    title: 'Turnike ve Geçiş Kontrol Donanımı',
    category: 'liability',
    kinds: ['sales'],
    products: ['gym', 'parking'],
    body:
      'Hizmet’in turnike, kart okuyucu, kamera gibi donanımlarla entegrasyonu yazılım düzeyindedir. Donanımın temini, kurulumu, elektrik ve ağ bağlantısı ile arızalarından donanım sağlayıcısı ve Müşteri sorumludur; ' +
      'internet veya donanım kesintisinde geçişleri yönetmek için yedek bir yöntem bulundurmak Müşteri’nin yükümlülüğüdür.',
  },
  {
    id: 'vet:mesleki-sorumluluk',
    title: 'Mesleki Sorumluluk',
    category: 'liability',
    kinds: ['sales'],
    products: ['vet'],
    body:
      'Hizmet, klinik kayıtlarının tutulmasına yardımcı bir yazılımdır; teşhis, tedavi, ilaç ve doz kararları tamamen hekimin mesleki sorumluluğundadır. ' +
      'Reçete, aşı ve ilaç kayıtlarının ilgili resmî sistemlere bildirimi ve mevzuatın öngördüğü sürelerle saklanması Müşteri’nin yükümlülüğüdür.',
  },
  {
    id: 'farm:resmi-kayit',
    title: 'Resmî Hayvan Kayıtları',
    category: 'liability',
    kinds: ['sales'],
    products: ['farm'],
    body:
      'Hizmet’teki hayvan kimlik, küpe, aşı ve sağlık kayıtları işletme içi takip amaçlıdır; Tarım ve Orman Bakanlığı’nın resmî kayıt sistemlerine yapılması gereken bildirimlerin yerine geçmez. Resmî bildirimler Müşteri’nin sorumluluğundadır.',
  },
  {
    id: 'beauty:fotograf-riza',
    title: 'Müşteri Fotoğrafları',
    category: 'data_protection',
    kinds: ['sales', 'data_processing'],
    products: ['hair', 'beauty', 'spa'],
    body:
      'Uygulama öncesi/sonrası fotoğraflar ve cilt/sağlık bilgileri kişisel veri, bazı durumlarda özel nitelikli kişisel veridir. Bu verileri kaydetmek ve özellikle tanıtım amacıyla paylaşmak için müşteriden ayrı ve açık rıza almak Müşteri’nin sorumluluğundadır.',
  },
  {
    id: 'apm:randevu-bildirim',
    title: 'Randevu Hatırlatmaları',
    category: 'liability',
    kinds: ['sales'],
    products: ['apm', 'hair', 'beauty', 'spa', 'vet'],
    body:
      'Randevu hatırlatma mesajları operatör ve üçüncü taraf altyapılar üzerinden iletilir; mesajın ulaşmaması veya gecikmesi nedeniyle kaçırılan randevulardan {{satici_kisa_ad}} sorumlu değildir. Hatırlatma dışındaki tanıtım amaçlı mesajlar için İYS onayı gerekir.',
  },
  {
    id: 'rent:kimlik-ehliyet',
    title: 'Kiracı Kimlik ve Ehliyet Bilgileri',
    category: 'data_protection',
    kinds: ['sales', 'data_processing'],
    products: ['rentacar'],
    body:
      'Kiracıların kimlik, ehliyet ve iletişim bilgileri ile araç konum verileri kişisel veridir. Bu verilerin kira sözleşmesi ve yasal yükümlülükler için gerekli olanla sınırlı tutulması, Emniyet’e yapılması gereken kiralık araç bildirimlerinin yapılması Müşteri’nin sorumluluğundadır. ' +
      'Trafik cezası, HGS/OGS ve hasar takip ekranları bilgi amaçlıdır; resmî kayıtlar esas alınır.',
  },
  {
    id: 'driving:resmi-surec',
    title: 'Resmî Sınav ve Kayıt Süreçleri',
    category: 'liability',
    kinds: ['sales'],
    products: ['drivingschool'],
    body:
      'Hizmet, kurs içi kursiyer, ders ve ödeme takibine yardımcıdır; Millî Eğitim Bakanlığı ve ilgili kurumların resmî kayıt, sınav ve belge sistemlerinin yerine geçmez. Resmî süreçlerin zamanında ve doğru yürütülmesi Müşteri’nin sorumluluğundadır.',
  },
  {
    id: 'parking:plaka-kamera',
    title: 'Plaka Tanıma ve Kamera Kayıtları',
    category: 'data_protection',
    kinds: ['sales', 'data_processing'],
    products: ['parking'],
    body:
      'Plaka ve kamera görüntüleri kişisel veridir. Otopark girişinde aydınlatma levhası bulundurmak, kayıtları amaçla sınırlı sürede saklamak ve tarifeleri doğru tanımlamak Müşteri’nin sorumluluğundadır. Ücret hesaplamaları Müşteri’nin girdiği tarifelere göre yapılır.',
  },
  {
    id: 'diet:tibbi-tavsiye',
    title: 'Tıbbi Tavsiye Niteliği Taşımaz',
    category: 'liability',
    kinds: ['sales', 'terms_of_use'],
    products: ['diet'],
    body:
      'Hizmet’te hazırlanan beslenme planları ve hesaplamalar yardımcı araçtır, tıbbi tavsiye değildir. Danışana uygunluğunun değerlendirilmesi yetkili diyetisyen veya hekimin mesleki sorumluluğundadır. Danışanların sağlık verileri için açık rıza almak Müşteri’nin yükümlülüğüdür.',
  },
  {
    id: 'kids:cocuk-verisi',
    title: 'Çocuklara Ait Veriler',
    category: 'data_protection',
    kinds: ['sales', 'data_processing'],
    products: ['kids'],
    body:
      'Çocuklara ait kişisel veriler yalnızca veli veya yasal temsilcinin bilgisi ve gerektiğinde açık rızasıyla işlenebilir. Veliden rıza alınması, fotoğraf/video paylaşımlarının sınırlandırılması ve yetkisiz kişilerin bu verilere erişmemesi için kullanıcı yetkilerinin doğru tanımlanması Müşteri’nin sorumluluğundadır.',
  },
  {
    id: 'compliance:danismanlik-degil',
    title: 'Mevzuat Uyumu ve Danışmanlık',
    category: 'liability',
    kinds: ['sales', 'terms_of_use'],
    products: COMPLIANCE_PRODUCTS,
    body:
      '{{urun_adi}}, mevzuata uyum süreçlerini kolaylaştıran bir yardımcı araçtır. Hizmet’in ürettiği kontrol listeleri, belgeler, etiketler ve raporlar hukuki, teknik veya mühendislik danışmanlığı, ' +
      'belgelendirme ya da resmî onay yerine geçmez. Mevzuat değişikliklerini takip etmek, çıktıları yetkili uzmanlara kontrol ettirmek ve ürün/işletmenin nihai uygunluğu Müşteri’nin sorumluluğundadır.',
  },

  // ---- Kişisel veriler --------------------------------------------------------------------
  {
    id: 'gen:kvkk-roller',
    title: 'Kişisel Verilerin Korunması',
    category: 'data_protection',
    kinds: ['sales'],
    body:
      'Müşteri’nin yetkililerine ait kimlik, iletişim ve fatura bilgileri bakımından {{satici_kisa_ad}} veri sorumlusudur ve bu veriler KVKK Aydınlatma Metni’ne uygun işlenir. ' +
      'Müşteri’nin Hizmet’e girdiği Son Kullanıcı verileri bakımından ise Müşteri veri sorumlusu, {{satici_kisa_ad}} veri işleyendir; taraflar bu konuda ayrıca Veri İşleme Sözleşmesi’ni kabul eder.',
  },
  {
    id: 'gen:yurtdisi-aktarim',
    title: 'Bulut Altyapısı ve Yurt Dışına Aktarım',
    category: 'data_protection',
    kinds: ['sales', 'kvkk_notice', 'data_processing'],
    body:
      'Hizmet, sunucuları yurt dışında bulunabilen bulut altyapısı sağlayıcıları (ör. Google Cloud/Firebase, Cloudflare) üzerinde çalışır. Kişisel verilerin yurt dışına aktarımı KVKK md. 9 ve ilgili yönetmelik çerçevesinde, ' +
      'gerektiğinde Kurul’un ilan ettiği standart sözleşmeler kullanılarak ve Kurul’a bildirimde bulunularak yapılır.',
  },

  // ---- Fikri mülkiyet ---------------------------------------------------------------------
  {
    id: 'gen:fikri-mulkiyet',
    title: 'Fikri Mülkiyet',
    category: 'intellectual_property',
    kinds: ['sales', 'terms_of_use'],
    body:
      'Hizmet’in yazılımı, tasarımı, markası ve dokümantasyonu üzerindeki tüm haklar {{satici_unvan}}’a aittir. Müşteri Verisi üzerindeki haklar Müşteri’de kalır; {{satici_kisa_ad}} bu verileri yalnızca Hizmet’i sunmak ve anonim istatistik üretmek amacıyla kullanabilir.',
  },

  // ---- Süre ve fesih ----------------------------------------------------------------------
  {
    id: 'gen:sure-fesih',
    title: 'Süre ve Fesih',
    category: 'termination',
    kinds: ['sales', 'terms_of_use'],
    body:
      'Sözleşme, ödemenin alındığı tarihte yürürlüğe girer ve seçilen abonelik dönemi sonunda kendiliğinden sona erer. Taraflardan biri esaslı bir yükümlülüğünü ihlal eder ve yazılı bildirime rağmen 15 gün içinde gidermezse diğer taraf sözleşmeyi haklı nedenle feshedebilir. ' +
      'Mevzuata aykırı kullanım, ödeme yapılmaması veya Hizmet’in güvenliğini tehdit eden durumlarda {{satici_kisa_ad}} erişimi derhâl askıya alabilir. Müşteri’nin haklı neden olmaksızın feshinde kullanılmayan dönem bedeli iade edilmez.',
  },

  // ---- Cayma hakkı (mesafeli satış) -------------------------------------------------------
  {
    id: 'ds:cayma',
    title: 'Cayma Hakkı',
    category: 'withdrawal',
    kinds: ['distance_sales', 'pre_information'],
    body:
      'Alıcı tüketici ise, sözleşmenin kurulduğu tarihten itibaren 14 gün içinde gerekçe göstermeksizin cayma hakkını {{satici_eposta}} adresine yazılı bildirimle kullanabilir; bedel 14 gün içinde iade edilir. ' +
      'Mesafeli Sözleşmeler Yönetmeliği md. 15/1-ğ uyarınca, elektronik ortamda anında ifa edilen hizmetlerde Alıcı’nın onayı ile ifaya başlanmışsa cayma hakkı kullanılamaz. ' +
      'Alıcı, ödeme adımında hizmetin hemen başlatılmasını onaylayarak bu durumu kabul eder. Alıcının tacir olduğu (işletme adına alım) hâllerde cayma hakkı uygulanmaz.',
  },
  {
    id: 'ds:ifa',
    title: 'Hizmetin İfası',
    category: 'subject',
    kinds: ['distance_sales', 'pre_information'],
    body:
      'Hizmet, ödemenin onaylanmasından sonra en geç 24 saat içinde (genellikle anında) Alıcı’nın hesabında kullanıma açılır. Teslim fiziksel değildir; erişim bilgileri {{alici_eposta}} adresine gönderilir.',
  },
  {
    id: 'pi:satici-bilgi',
    title: 'Satıcı Bilgileri',
    category: 'parties',
    kinds: ['pre_information', 'kvkk_notice'],
    body:
      'Unvan: {{satici_unvan}}\nAdres: {{satici_adres}}\nVergi Dairesi / No: {{satici_vergi_dairesi}} / {{satici_vergi_no}}\nMERSİS: {{satici_mersis}}\nE-posta: {{satici_eposta}} · Telefon: {{satici_telefon}} · KEP: {{satici_kep}}',
  },
  {
    id: 'pi:urun-nitelik',
    title: 'Hizmetin Temel Nitelikleri ve Fiyatı',
    category: 'subject',
    kinds: ['pre_information'],
    body:
      'Hizmet: {{urun_adi}} – {{paket_adi}} paketi, {{odeme_donemi}} abonelik.\nToplam bedel: {{fiyat}} TL (tüm vergiler dahil). Ek kargo veya teslim ücreti yoktur.\nÖdeme: Kredi/banka kartı ile peşin (PayTR).',
  },

  // ---- KVKK aydınlatma metni --------------------------------------------------------------
  {
    id: 'kvkk:veri-sorumlusu',
    title: 'Veri Sorumlusu',
    category: 'parties',
    kinds: ['kvkk_notice'],
    body: '6698 sayılı Kişisel Verilerin Korunması Kanunu uyarınca kişisel verileriniz, veri sorumlusu sıfatıyla {{satici_unvan}} tarafından aşağıda açıklanan kapsamda işlenmektedir.',
  },
  {
    id: 'kvkk:amac',
    title: 'İşlenen Veriler, Amaçlar ve Hukuki Sebepler',
    category: 'data_protection',
    kinds: ['kvkk_notice'],
    body:
      'Kimlik, iletişim, müşteri işlem, finans ve işlem güvenliği verileriniz; üyelik ve abonelik sözleşmesinin kurulması ve ifası (KVKK md. 5/2-c), faturalandırma ve yasal yükümlülükler (md. 5/2-ç), ' +
      'destek taleplerinin yönetimi ve hizmet güvenliği (meşru menfaat, md. 5/2-f) amaçlarıyla işlenir. Tanıtım iletileri yalnızca açık rızanız / İYS onayınız ile gönderilir.',
  },
  {
    id: 'kvkk:aktarim',
    title: 'Aktarım ve Toplama Yöntemi',
    category: 'data_protection',
    kinds: ['kvkk_notice'],
    body:
      'Verileriniz web sitesi, mobil uygulama ve destek kanalları üzerinden elektronik ortamda toplanır; ödeme kuruluşu, e-fatura entegratörü, bulut altyapısı ve SMS/e-posta sağlayıcıları ile yetkili kamu kurumlarına, yalnızca yukarıdaki amaçlar için ve gerekli olduğu ölçüde aktarılabilir.',
  },
  {
    id: 'kvkk:haklar',
    title: 'İlgili Kişinin Hakları',
    category: 'data_protection',
    kinds: ['kvkk_notice'],
    body:
      'KVKK md. 11 uyarınca; verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini veya silinmesini isteme, aktarıldığı üçüncü kişileri bilme, itiraz etme ve zararın giderilmesini talep etme haklarına sahipsiniz. ' +
      'Başvurularınızı {{satici_eposta}} veya {{satici_kep}} adresine iletebilirsiniz; başvurular en geç 30 gün içinde ücretsiz sonuçlandırılır.',
  },

  // ---- Veri işleme sözleşmesi -------------------------------------------------------------
  {
    id: 'dpa:talimat',
    title: 'Talimatlara Uygun İşleme',
    category: 'provider_obligations',
    kinds: ['data_processing'],
    body:
      'Veri işleyen sıfatıyla {{satici_kisa_ad}}, Son Kullanıcı verilerini yalnızca Hizmet’in sunulması için ve Müşteri’nin Hizmet ayarları aracılığıyla verdiği talimatlar doğrultusunda işler; kendi amaçları için kullanmaz, satmaz ve üçüncü kişilerle paylaşmaz.',
  },
  {
    id: 'dpa:alt-isleyen',
    title: 'Alt İşleyenler',
    category: 'provider_obligations',
    kinds: ['data_processing'],
    body:
      'Müşteri, Hizmet’in barındırma, e-posta, SMS ve ödeme altyapısı için alt işleyen kullanılmasını kabul eder. {{satici_kisa_ad}} alt işleyenlerle en az bu sözleşmedeki koruma düzeyini sağlayan sözleşmeler yapar ve güncel listeyi talep hâlinde paylaşır.',
  },
  {
    id: 'dpa:ihlal',
    title: 'Veri İhlali Bildirimi',
    category: 'data_protection',
    kinds: ['data_processing'],
    body:
      '{{satici_kisa_ad}}, Son Kullanıcı verilerini etkileyen bir güvenlik ihlalini öğrendiğinde Müşteri’ye gecikmeksizin bildirir ve Müşteri’nin KVKK md. 12/5 kapsamında Kurul’a ve ilgili kişilere 72 saat içinde bildirim yapabilmesi için gerekli bilgileri sağlar.',
  },
  {
    id: 'dpa:sona-erme',
    title: 'Sözleşme Sonunda Verilerin İadesi ve Silinmesi',
    category: 'termination',
    kinds: ['data_processing'],
    body:
      'Abonelik sona erdiğinde Müşteri 30 gün içinde verilerini dışa aktarabilir. Bu süre sonunda Son Kullanıcı verileri, yasal saklama yükümlülükleri saklı kalmak üzere silinir; yedeklerdeki kopyalar olağan yedek döngüsü içinde imha edilir.',
  },

  // ---- SLA ----------------------------------------------------------------------------------
  {
    id: 'sla:erisilebilirlik',
    title: 'Erişilebilirlik Hedefi',
    category: 'provider_obligations',
    kinds: ['sla'],
    body:
      '{{satici_kisa_ad}}, planlı bakım süreleri hariç aylık %99,5 erişilebilirlik hedefler. Planlı bakımlar mümkün olduğunca gece saatlerinde yapılır ve en az 24 saat önceden duyurulur. Üçüncü taraf altyapı kesintileri ve mücbir sebepler hesaplamaya dahil edilmez.',
  },
  {
    id: 'sla:destek',
    title: 'Destek Süreleri',
    category: 'provider_obligations',
    kinds: ['sla'],
    body:
      'Destek talepleri panel içi talep formu ve {{satici_eposta}} üzerinden alınır. Hizmeti tamamen durduran sorunlara iş saatlerinde 4 saat, diğer taleplere 2 iş günü içinde ilk yanıt verilmesi hedeflenir.',
  },

  // ---- Mücbir sebep / uyuşmazlık / genel ----------------------------------------------------
  {
    id: 'gen:mucbir',
    title: 'Mücbir Sebep',
    category: 'force_majeure',
    kinds: ['sales', 'sla', 'terms_of_use'],
    body:
      'Doğal afet, salgın, savaş, terör, grev, siber saldırı, enerji ve iletişim altyapısındaki yaygın kesintiler ile kamu otoritesi kararları gibi tarafların kontrolü dışındaki olaylar süresince tarafların yükümlülükleri askıya alınır. Mücbir sebep 30 günü aşarsa taraflar sözleşmeyi tazminatsız feshedebilir.',
  },
  {
    id: 'gen:uyusmazlik-ticari',
    title: 'Uyuşmazlıkların Çözümü',
    category: 'dispute',
    kinds: ['sales', 'terms_of_use', 'data_processing', 'sla'],
    body:
      'Bu sözleşme Türk hukukuna tabidir. Ticari uyuşmazlıklarda dava açılmadan önce 6102 sayılı TTK md. 5/A uyarınca arabuluculuğa başvurulur; arabuluculukta anlaşma sağlanamazsa {{yetkili_mahkeme}} mahkemeleri ve icra daireleri yetkilidir. ' +
      '{{satici_kisa_ad}}’un elektronik kayıtları HMK md. 193 kapsamında delil sözleşmesi niteliğindedir.',
  },
  {
    id: 'ds:uyusmazlik-tuketici',
    title: 'Şikâyet ve Uyuşmazlık Yolları',
    category: 'dispute',
    kinds: ['distance_sales', 'pre_information'],
    body:
      'Alıcı tüketici ise, şikâyet ve itirazlarını her yıl Ticaret Bakanlığı’nca belirlenen parasal sınırlar dahilinde yerleşim yerindeki veya işlemin yapıldığı yerdeki Tüketici Hakem Heyeti’ne, bu sınırları aşan uyuşmazlıklarda Tüketici Mahkemesi’ne iletebilir. ' +
      'Talepler ayrıca {{satici_eposta}} adresine yazılı olarak iletilebilir.',
  },
  {
    id: 'gen:degisiklik',
    title: 'Sözleşme Değişiklikleri ve Bildirimler',
    category: 'general',
    kinds: ['sales', 'terms_of_use', 'data_processing', 'sla'],
    body:
      '{{satici_kisa_ad}}, sözleşmeyi mevzuat veya Hizmet’teki değişiklikler nedeniyle güncelleyebilir; esaslı değişiklikler yürürlükten en az 15 gün önce Müşteri’ye e-posta veya panel bildirimi ile duyurulur. ' +
      'Müşteri yeni koşulları kabul etmezse dönem sonunda aboneliği yenilememe hakkına sahiptir. Taraflara yapılacak bildirimler kayıtlı e-posta adreslerine yapılır.',
  },
  {
    id: 'gen:yururluk',
    title: 'Yürürlük',
    category: 'general',
    kinds: ['sales', 'distance_sales', 'data_processing', 'sla', 'terms_of_use'],
    body:
      'Müşteri, bu sözleşmenin ({{surum}} sürümü) tüm maddelerini okuduğunu, anladığını ve elektronik ortamda onay vererek kabul ettiğini beyan eder. Sözleşme {{tarih}} tarihinde kurulmuştur.',
  },
];

function categoryOrder(category: ClauseCategory): number {
  return CLAUSE_CATEGORIES.indexOf(category);
}

/** Ürün ve tür için önerilen örnek maddeler, kategori sırasıyla. */
export function sampleClausesFor(kind: ContractKind, product: ContractProduct): SampleClause[] {
  return SAMPLE_CLAUSES.filter(
    (c) =>
      c.kinds.includes(kind) &&
      (!c.products?.length || (product !== 'all' && c.products.includes(product))),
  ).sort((a, b) => categoryOrder(a.category) - categoryOrder(b.category));
}

export function toContractClause(sample: SampleClause, index: number): ContractClause {
  return {
    id: `c${index + 1}`,
    title: sample.title,
    body: sample.body,
    category: sample.category,
    sampleId: sample.id,
  };
}

export function productLabel(product: ContractProduct): string {
  return product === 'all' ? 'Tüm Ürünler' : PRODUCT_LABELS[product] ?? product;
}

export function defaultContractTitle(kind: ContractKind, product: ContractProduct): string {
  const kindLabel = CONTRACT_KIND_LABELS[kind];
  return product === 'all' ? `Odivon ${kindLabel}` : `Odivon ${productLabel(product)} – ${kindLabel}`;
}
