import { Injectable } from '@nestjs/common';
import { AiChatRequestDto, CalculateDosageDto } from './ai.dto';

export interface DosageCard {
  drugName: string;
  species: string;
  weight: number;
  doseMgPerKg: number;
  totalDoseMg: number;
  stockConcentration: string;
  volumeMl: number;
  route: string;
  frequency: string;
  duration: string;
  warnings?: string[];
}

export interface AiChatResponse {
  message: string;
  dosageCard?: DosageCard;
  suggestedActions?: string[];
}

interface DrugRule {
  names: string[];
  speciesDose: Record<string, { min: number; max: number; standard: number; unit: string; route: string; freq: string; dur: string }>;
  concentration: { text: string; mgPerMl: number };
  contraindications: string[];
  toxicSpecies?: string[];
}

const DRUG_DATABASE: DrugRule[] = [
  {
    names: ['amoksisilin', 'amoxicillin', 'synulox', 'augmentin', 'amoxiklav'],
    speciesDose: {
      kedi: { min: 12.5, max: 20, standard: 15, unit: 'mg/kg', route: 'SC / Oral', freq: 'Günde 2 kez (q12h)', dur: '5 - 7 gün' },
      köpek: { min: 12.5, max: 25, standard: 15, unit: 'mg/kg', route: 'SC / Oral', freq: 'Günde 2 kez (q12h)', dur: '7 - 10 gün' },
    },
    concentration: { text: '140 mg/ml + 35 mg/ml (Synulox Enj.)', mgPerMl: 140 },
    contraindications: ['Penisilin veya klavulanat aşırı duyarlılığı.', 'Tavşan, kobay, hamster gibi küçük kemirgenlerde ölümcül enterotoksemi riski!'],
  },
  {
    names: ['meloksikam', 'meloxicam', 'metacam', 'meloxidyl', 'maxicam'],
    speciesDose: {
      kedi: { min: 0.05, max: 0.1, standard: 0.05, unit: 'mg/kg', route: 'SC / Oral', freq: 'Günde 1 kez (q24h)', dur: 'Maks. 3 - 5 gün (Böbrek takibi)' },
      köpek: { min: 0.1, max: 0.2, standard: 0.2, unit: 'mg/kg (Yükleme)', route: 'SC / Oral', freq: 'Günde 1 kez (q24h)', dur: '5 - 7 gün' },
    },
    concentration: { text: '5 mg/ml Enjeksiyonluk', mgPerMl: 5 },
    contraindications: ['Dehidrasyon, hipovolemi, böbrek yetmezliği, GIS ülserasyonu.', 'Kortikosteroidlerle eş zamanlı kullanım KESİNLİKLE yasaktır.'],
  },
  {
    names: ['metronidazol', 'metronidazole', 'flagyl', 'metrajil'],
    speciesDose: {
      kedi: { min: 10, max: 15, standard: 10, unit: 'mg/kg', route: 'Oral / IV Yavaş', freq: 'Günde 2 kez (q12h)', dur: '5 - 7 gün' },
      köpek: { min: 15, max: 25, standard: 15, unit: 'mg/kg', route: 'Oral / IV Yavaş', freq: 'Günde 2 kez (q12h)', dur: '5 - 7 gün' },
    },
    concentration: { text: '5 mg/ml Serum (IV) / 250 mg tb', mgPerMl: 5 },
    contraindications: ['Yüksek doz ve uzun süreli kullanımda nistagmus, ataksi ve nörotoksisite riski.'],
  },
  {
    names: ['sefazolin', 'cefazolin', 'cefazil', 'sefazol'],
    speciesDose: {
      kedi: { min: 20, max: 30, standard: 25, unit: 'mg/kg', route: 'IV / IM Yavaş', freq: 'Günde 3 kez (q8h)', dur: 'Perioperatif / 5 gün' },
      köpek: { min: 20, max: 30, standard: 25, unit: 'mg/kg', route: 'IV / IM Yavaş', freq: 'Günde 3 kez (q8h)', dur: 'Perioperatif / 5 gün' },
    },
    concentration: { text: '100 mg/ml (1g flakon 10ml sulandırma)', mgPerMl: 100 },
    contraindications: ['Sefalosporin duyarlılığı.', 'Hızlı IV enjeksiyon kusma ve hipotansiyona yol açabilir.'],
  },
  {
    names: ['parasetamol', 'paracetamol', 'asetaminofen', 'parol'],
    speciesDose: {},
    concentration: { text: 'N/A', mgPerMl: 0 },
    contraindications: ['KEDİLERDE KESİNLİKLE KONTRENDİKEDİR! Methemoglobinemi ve ölümcül karaciğer nekrozu oluşturur!'],
    toxicSpecies: ['kedi'],
  },
  {
    names: ['ivermektin', 'ivermectin', 'ivomec', 'vilmectin'],
    speciesDose: {
      kedi: { min: 0.2, max: 0.3, standard: 0.2, unit: 'mg/kg', route: 'SC', freq: '14 günde bir', dur: '1 - 2 uygulama' },
      köpek: { min: 0.2, max: 0.4, standard: 0.2, unit: 'mg/kg', route: 'SC', freq: '14 günde bir', dur: '1 - 2 uygulama' },
    },
    concentration: { text: '%1 (10 mg/ml)', mgPerMl: 10 },
    contraindications: ['Collie, Australian Shepherd, Border Collie gibi MDR1 mutasyonu taşıyan ırklarda KULLANILMAZ!'],
  },
];

@Injectable()
export class VetAiService {
  async chat(dto: AiChatRequestDto): Promise<AiChatResponse> {
    const raw = dto.message.toLowerCase();
    const species = dto.context?.species?.toLowerCase() || (raw.includes('köpek') ? 'köpek' : 'kedi');
    const weightMatch = raw.match(/(\d+([.,]\d+)?)\s*kg/);
    const weight = dto.context?.weight || (weightMatch ? parseFloat(weightMatch[1].replace(',', '.')) : 4.0);

    for (const drug of DRUG_DATABASE) {
      if (drug.names.some((n) => raw.includes(n))) {
        return this.calculateDosage({ drug: drug.names[0], weight, species });
      }
    }

    if (raw.includes('kusma') || raw.includes('ishal') || raw.includes('gastro')) {
      const speciesTitle = species === 'kedi' ? 'Kedi' : 'Köpek';
      const testName = species === 'kedi' ? 'Panleukopeni (FPV)' : 'Parvovirus (CPV) & Giardia';
      return {
        message: '### 🐾 Gastroenterit & Triage Protokolü (' + speciesTitle + ')\n\n' +
          '**1. Acil Değerlendirme:**\n' +
          '- Dehidrasyon, CRT ve mukozal turgor kontrolü yapınız.\n' +
          '- ' + testName + ' hızlı test kitini uygulayınız.\n\n' +
          '**2. Önerilen Tedavi:**\n' +
          '- Maropitant (Cerenia) 1 mg/kg SC (Günde 1 kez)\n' +
          '- Famotidin 0.5 mg/kg veya Omeprazol 1 mg/kg\n' +
          '- Dengeli elektrolit sıvı infüzyonu (Ringer Laktat)\n\n' +
          '**3. Hasta Sahibi WhatsApp Mesajı:**\n' +
          '> *"Geçmiş olsun! Kusma ve ishal durumunda minik dostumuza 12 saat mama vermeyip taze su bulundurunuz."*',
        suggestedActions: [
          'Dozaj Kartı Oluştur (Cerenia 1 mg/kg)',
          'Hemogram & Biyokimya Tahlil Şablonu Aç',
          'Hasta Sahibine WhatsApp Bilgilendirmesi Gönder',
        ],
      };
    }

    if (raw.includes('hemogram') || raw.includes('biyokimya') || raw.includes('tahlil') || raw.includes('wbc') || raw.includes('crea')) {
      return {
        message: '### 🔬 Laboratuvar Parametre Değerlendirmesi\n\n' +
          '- **BUN & Kreatinin:** Böbrek fonksiyonları ve prerenal azotemi ayrımı.\n' +
          '- **ALT & AST:** Karaciğer enzim aktiviteleri ve hepatoselüler hasar.\n' +
          '- **WBC / Lökosit:** İnflamasyon, sepsis veya viral baskılanma tablosu.',
        suggestedActions: ['Tahlil Sonuçlarını İçe Aktar', 'IRIS Böbrek Evreleme Protokolü', 'Sıvı Tedavi Protokolü'],
      };
    }

    if (raw.includes('whatsapp') || raw.includes('sms') || raw.includes('mesaj')) {
      return {
        message: '### 📱 Hasta Sahibi İletişim Şablonu (WhatsApp / SMS)\n\n' +
          '**Operasyon Sonrası Bilgilendirme:**\n' +
          '> *"Sayın hasta sahibimiz, minik dostumuzun operasyonu başarıyla tamamlandı. 🩺 İlk 24 saat uyuşukluk normaldir. Yakalığını çıkarmayınız ve dikiş bölgesini kuru tutunuz."*\n\n' +
          '**Aşı Hatırlatması:**\n' +
          '> *"Merhaba, minik dostumuzun karma aşı tekrar zamanı gelmiştir! 🐾 Randevunuz için polikliniğimize bekleriz."*',
        suggestedActions: ['Metni Panoya Kopyala', 'WhatsApp Web Üzerinden Gönder', 'SMS Kuyruğuna Ekle'],
      };
    }

    return {
      message: 'Merhaba! Ben **Odivon AI Klinik Asistanı**. 🐾\n\n' +
        'Size şu konularda yardımcı olabilirim:\n' +
        '- 💊 **Hassas Dozaj:** İlaç adı ve kg belirterek ml hesaplama (Örn: *"4.5 kg kedi Synulox dozu"*)\n' +
        '- 🩺 **Triage & Teşhis:** Semptomlara göre olası protokoller\n' +
        '- 🔬 **Laboratuvar:** Hemogram ve biyokimya analizleri\n' +
        '- 📲 **İletişim:** Hasta sahibi WhatsApp ve SMS taslakları\n\n' +
        'Nasıl yardımcı olabilirim?',
      suggestedActions: [
        'Dozaj Hesaplayıcı Aç',
        'Kusma & İshal Triage Protokolü',
        'Aşı Gecikme Takibi',
        'Hasta Sahibi WhatsApp Şablonları',
      ],
    };
  }

  async calculateDosage(dto: CalculateDosageDto): Promise<AiChatResponse> {
    const rawDrug = dto.drug.toLowerCase().trim();
    const species = (dto.species || 'kedi').toLowerCase();
    const weight = Number(dto.weight) || 4.0;

    const matched = DRUG_DATABASE.find((d) => d.names.some((n) => rawDrug.includes(n))) || {
      names: [dto.drug],
      speciesDose: {
        kedi: { min: 10, max: 20, standard: 15, unit: 'mg/kg', route: 'SC / Oral', freq: 'Günde 2 kez (q12h)', dur: '5 - 7 gün' },
        köpek: { min: 10, max: 20, standard: 15, unit: 'mg/kg', route: 'SC / Oral', freq: 'Günde 2 kez (q12h)', dur: '5 - 7 gün' },
      },
      concentration: { text: 'Standart Preparat', mgPerMl: 100 },
      contraindications: ['Veteriner hekim onaylı prospektüs kontrol edilmelidir.'],
    };

    if (matched.toxicSpecies?.includes(species)) {
      return {
        message: '⚠️ **ÖLÜMCÜL TOKSİSİTE UYARISI!**\n\n' +
          '**' + dto.drug.toUpperCase() + '**, ' + species.toUpperCase() + ' türünde **KESİNLİKLE KULLANILAMAZ!**\n' +
          'Ağır karaciğer nekrozu ve methemoglobinemiye yol açar.',
        suggestedActions: ['Alternatif Güvenli Ağrı Kesici Protokolü', 'Toksikoloji Acil Protokolü'],
      };
    }

    const speciesKey = species.includes('köpek') ? 'köpek' : 'kedi';
    const doseSpec = matched.speciesDose[speciesKey] || matched.speciesDose['kedi'] || {
      min: 10, max: 15, standard: 10, unit: 'mg/kg', route: 'SC / Oral', freq: 'Günde 2 kez', dur: '5 gün'
    };

    const doseMgPerKg = doseSpec.standard;
    const totalDoseMg = Math.round(weight * doseMgPerKg * 100) / 100;
    const mgPerMl = matched.concentration.mgPerMl || 100;
    const volumeMl = Math.round((totalDoseMg / mgPerMl) * 100) / 100;

    const dosageCard: DosageCard = {
      drugName: matched.names[0].toUpperCase(),
      species: speciesKey === 'köpek' ? 'Köpek' : 'Kedi',
      weight,
      doseMgPerKg,
      totalDoseMg,
      stockConcentration: matched.concentration.text,
      volumeMl,
      route: doseSpec.route,
      frequency: doseSpec.freq,
      duration: doseSpec.dur,
      warnings: matched.contraindications,
    };

    return {
      message: '### 💊 ' + dosageCard.drugName + ' Dozaj & Uygulama Kartı\n\n' +
        '**Hasta:** ' + dosageCard.species + ' | **Ağırlık:** ' + dosageCard.weight + ' kg\n' +
        '- **Uygulanacak Doz:** ' + dosageCard.doseMgPerKg + ' mg/kg (Toplam: **' + dosageCard.totalDoseMg + ' mg**)\n' +
        '- **Enjeksiyon / Uygulama Hacmi:** **' + dosageCard.volumeMl + ' ml** (' + dosageCard.stockConcentration + ')\n' +
        '- **Yol & Sıklık:** ' + dosageCard.route + ' | ' + dosageCard.frequency + '\n' +
        '- **Süre:** ' + dosageCard.duration + '\n\n' +
        '**⚠️ Klinik Dikkat & Kontrendikasyon:**\n' +
        (dosageCard.warnings?.map((w) => '- ' + w).join('\n') || '- Prospektüs kontrolü önerilir.'),
      dosageCard,
      suggestedActions: [
        'Reçeteye / Hasta Dosyasına Ekle',
        'Stoktan Otomatik Düşüm Yap',
        'Hasta Sahibine Kullanım Talimatı Gönder',
      ],
    };
  }
}
