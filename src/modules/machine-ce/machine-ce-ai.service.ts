import { Injectable, Logger } from '@nestjs/common';
import { MachineCeRecord } from './machine-ce.types';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface AiAnalyzeMachineInput {
  name: string;
  machineType?: string;
  location?: string;
  hazardHint?: string;
}

export interface AiAnalyzeMachineOutput {
  provider: 'gemini' | 'expert-engine';
  machineType: string;
  directive: string;
  standardRefs: string[];
  hazard: string;
  severity: number;
  probability: number;
  riskScore: number;
  performanceLevel: string;
  protectiveMeasures: string;
  residualRisk: string;
  requiredTests: string[];
  notes: string;
}

export interface AiPortfolioAuditOutput {
  provider: 'gemini' | 'expert-engine';
  headline: string;
  readinessScore: number;
  gaps: string[];
  recommendations: string[];
  regulation2023Notes: string[];
}

export interface AiCopilotAskInput {
  question: string;
  contextMachineName?: string;
}

export interface AiCopilotAskOutput {
  provider: 'gemini' | 'expert-engine';
  title: string;
  answer: string;
  referencedStandards: string[];
  checklist: string[];
  suggestedDraft: {
    name: string;
    machineType: string;
    directive: string;
    standardRefs: string[];
    hazard: string;
    severity: number;
    probability: number;
    protectiveMeasures: string;
    residualRisk: string;
  };
}

interface MachineKnowledgeRule {
  keywords: RegExp;
  machineType: string;
  directive: string;
  standards: string[];
  hazard: string;
  severity: number;
  probability: number;
  pl: string;
  protectiveMeasures: string;
  residualRisk: string;
  requiredTests: string[];
}

const KNOWLEDGE_BASE: readonly MachineKnowledgeRule[] = [
  {
    keywords: /(abkant|pres|press|eksantrik|hidrolik pres|büküm|punch|zımba)/i,
    machineType: 'Hidrolik / Mekanik Pres & Sac İşleme Makinesi',
    directive: '2006/42/EC (Ek IV), AB 2023/1230, 2014/30/EU (EMC)',
    standards: [
      'EN ISO 12100:2010',
      'EN 12622:2009+A1:2013',
      'EN ISO 16092-1:2018',
      'EN ISO 16092-3:2018',
      'EN 60204-1:2018',
      'EN ISO 13849-1:2023 (PL e, Kat. 4)',
      'EN ISO 13855:2010',
    ],
    hazard:
      'Üst kalıp (koç) iniş bölgesinde el/parmak ezilmesi, arka dayama hareketinden kaynaklı sıkışma, yüksek basınçlı hidrolik hortum patlaması ve ayak pedalıyla istemsiz tetikleme tehlikesi.',
    severity: 5,
    probability: 2,
    pl: 'PL e (Kategori 4)',
    protectiveMeasures:
      '1. Tasarımla güvenlik: Çift valfli yedekli hidrolik blok ve silindir düşme emniyeti.\n' +
      '2. Teknik koruma: EN 12622 uyumlu Tip 4 aktif optoelektronik lazer koruma sistemi (AOPDDR / ışık perdesi, PL e), kilitlemeli yan ve arka muhafaza kapıları, 3 konumlu onaylı ayak pedalı.\n' +
      '3. Kontrol sistemi: Emniyet PLC / çift kanallı emniyet rölesi ile her çevrimde valf konum izleme ve < 10 mm/s güvenli kapanma hızı.',
    residualRisk:
      'Kalıp değişim ve bakım modunda LOTO (Kilitleme/Etiketleme) uygulanmalı, EN 388 kesilmeye dirençli eldiven kullanılmalı ve makine gövdesinde ISO 7010 W024 (El Ezilme Uyarısı) piktogramı bulunmalıdır.',
    requiredTests: [
      'EN ISO 13855 duruş süresi (stopping time) ve emniyet mesafesi ölçümü',
      'EN 60204-1 Madde 18.2 koruyucu iletken (topraklama) süreklilik testi',
      'Hidrolik aşırı basınç emniyet valfi ve çift kanal geri besleme doğrulama testi',
    ],
  },
  {
    keywords: /(robot|kuka|fanuc|abb|yaskawa|kaynak hücresi|mig|mag|tig|cobot|kolaboratif)/i,
    machineType: 'Endüstriyel Robotik Otomasyon & Kaynak Hücresi',
    directive: '2006/42/EC, AB 2023/1230, 2014/30/EU (EMC)',
    standards: [
      'EN ISO 12100:2010',
      'EN ISO 10218-1:2011',
      'EN ISO 10218-2:2011',
      'ISO/TS 15066:2016',
      'EN 60204-1:2018',
      'EN ISO 13849-1:2023 (PL d/e, Kat. 3)',
      'EN ISO 13855:2010',
      'EN ISO 14119:2013',
    ],
    hazard:
      'Robot kolunun çalışma zarfı içinde operatöre çarpması/sıkıştırması, yükleme istasyonunda fikstür kapanması, kaynak ark radyasyonu, duman maruziyeti ve beklenmedik yeniden başlatma.',
    severity: 5,
    probability: 2,
    pl: 'PL d / PL e (Kategori 3/4)',
    protectiveMeasures:
      '1. Çevre koruma: EN ISO 14120 uyumlu fiziksel emniyet çiti ve EN ISO 14119 Tip 4 RFID kodlu kilitlemeli (guard locking) erişim kapısı.\n' +
      '2. Operatör yükleme alanı: Tip 4 emniyet ışık perdesi veya 2D lazer alan tarayıcı ile içeride personel varken yeniden başlatmayı önleme (presence sensing).\n' +
      '3. Manuel mod: Teach-pendant üzerinde 3 konumlu enabling switch ve maksimum 250 mm/s güvenli azaltılmış hız (SLS).',
    residualRisk:
      'Teach (öğretme) modunda hücre içine yalnızca yetkili mühendis girebilir; otomatik ark perdesi ve lokal duman emiş ünitesi aktif olmadan çevrim başlatılmamalıdır.',
    requiredTests: [
      'EN ISO 13855 ışık perdesi / alan tarayıcı yaklaşım mesafesi doğrulaması',
      'Acil durdurma (EN ISO 13850 Stop Kategori 0/1) ve kapı kilidi fonksiyon testi',
      'EN 60204-1 yalıtım direnci ve topraklama süreklilik testi',
    ],
  },
  {
    keywords: /(lazer|laser|kesim|fiber|co2|optik|markalama)/i,
    machineType: 'Endüstriyel Lazer Kesim & İşleme Makinesi',
    directive: '2006/42/EC, AB 2023/1230, 2014/30/EU (EMC)',
    standards: [
      'EN ISO 12100:2010',
      'EN ISO 11553-1:2020',
      'EN 60825-1:2014+A11:2021 (Sınıf 1 Kabin)',
      'EN 60204-1:2018',
      'EN ISO 13849-1:2023 (PL d, Kat. 3)',
    ],
    hazard:
      'Sınıf 4 yüksek güçlü lazer ışınımının göz/cilt yaralanmasına yol açması, mekik tablası (shuttle table) değişiminde ezilme, kesim dumanı ve yüksek voltajlı rezonatör tehlikesi.',
    severity: 5,
    probability: 2,
    pl: 'PL d (Kategori 3)',
    protectiveMeasures:
      '1. Işın koruma: Sınıf 4 lazer kaynağını çalışma sırasında Sınıf 1 seviyesine düşüren tam kapalı koruyucu kabin ve EN 12254 sertifikalı lazer gözetleme camı.\n' +
      '2. Kapı emniyeti: Kabin kapılarında yedekli emniyet şalteri ile kapı açıldığında lazer shutter/ışın kesme (beam interlock).\n' +
      '3. Mekik tablası: Tabla değişim alanında ışık bariyeri ve sesli/ışıklı ikaz.',
    residualRisk:
      'Servis modunda kabin açıkken optik hizalama yapılacaksa EN 207 uyumlu dalga boyuna özel (örn. 1064 nm OD7+) lazer koruyucu gözlük zorunludur.',
    requiredTests: [
      'EN 60825-1 kabin sızdırmazlık ve kapı interlock ışın kesme süresi testi',
      'Mekik tablası ışık perdesi duruş testi',
      'EN 60204-1 yüksek gerilim ve topraklama süreklilik testi',
    ],
  },
  {
    keywords: /(paketleme|ambalaj|thermoform|dolum|etiketleme|shrink|streç|gıda|hat)/i,
    machineType: 'Otomatik Paketleme, Dolum & Hat Makinesi',
    directive: '2006/42/EC, AB 2023/1230, 2014/30/EU (EMC)',
    standards: [
      'EN ISO 12100:2010',
      'EN 415-1:2014',
      'EN 415-10:2014',
      'EN 1672-2:2020',
      'EN 60204-1:2018',
      'EN ISO 13849-1:2023 (PL d, Kat. 3)',
    ],
    hazard:
      'Yapıştırma çeneleri ve döner bıçaklarda kesilme/yanma, film çekme merdanelerinde dolanma, konveyör tahrik tamburunda sıkışma ve sıcak yüzey temas tehlikesi.',
    severity: 4,
    probability: 2,
    pl: 'PL d (Kategori 3)',
    protectiveMeasures:
      '1. Muhafaza: Bıçak ve sıcak çene bölgelerinde EN ISO 13857 erişim mesafelerine uygun tünelli sabit muhafaza ve manyetik kodlu emniyet şalterli kapaklar.\n' +
      '2. Tahrik güvenliği: Kapak açıldığında STO (Safe Torque Off) ile servo/inverter enerjisinin güvenli kesilmesi ve pnömatik tahliye (dump valve).',
    residualRisk:
      'Isıtıcı çeneler duruş sonrasında sıcak kalır; ISO 7010 W017 (Sıcak Yüzey) etiketi ve soğuma süresi prosedürü uygulanmalıdır.',
    requiredTests: [
      'EN 415-10 tünel açıklığı ve erişim mesafesi doğrulaması',
      'Pnömatik havalandırma (residual pressure dump) ve STO fonksiyon testi',
      'EN 60204-1 elektrik panosu IP koruma ve topraklama testi',
    ],
  },
  {
    keywords: /(konveyör|bant|taşıma|paletleme|asansör|vinç|forklift|agv|depo)/i,
    machineType: 'Konveyör, İntralojistik & Malzeme Taşıma Sistemi',
    directive: '2006/42/EC, AB 2023/1230, 2014/30/EU',
    standards: [
      'EN ISO 12100:2010',
      'EN 619:2022',
      'EN 620:2021',
      'EN ISO 13850:2015',
      'EN 60204-1:2018',
      'EN ISO 13849-1:2023 (PL c/d)',
    ],
    hazard:
      'Tahrik ve kuyruk tamburu nip noktalarında uzuv/kıyafet kaptırma, geçiş noktalarında yük devrilmesi ve hat boyunca acil müdahale gecikmesi.',
    severity: 4,
    probability: 2,
    pl: 'PL c / PL d',
    protectiveMeasures:
      '1. Nip noktası koruması: Tüm tambur, dişli ve zincir tahrik noktalarında sabit nip muhafazaları.\n' +
      '2. Acil durdurma: Hat boyunca erişilebilir ipli acil durdurma şalterleri (pull-cord switch, EN ISO 13850) ve yük geçişlerinde muting fonksiyonlu ışık perdesi.',
    residualRisk:
      'Konveyör üzerine çıkılması yasaktır; yalnızca yaya üst geçitleri kullanılmalı ve bakım öncesi ana şalter LOTO kilidiyle kilitlenmelidir.',
    requiredTests: [
      'İpli acil durdurma şalteri çekme kuvveti ve hat duruş testi',
      'EN 619 muting sensör dizilimi ve zaman aşımı doğrulaması',
      'EN 60204-1 topraklama süreklilik testi',
    ],
  },
  {
    keywords: /(cnc|torna|freze|işleme merkezi|dik işleme|taşlama|testere|delme)/i,
    machineType: 'CNC Takım Tezgâhı & Talaşlı İmalat Makinesi',
    directive: '2006/42/EC, AB 2023/1230, 2014/30/EU',
    standards: [
      'EN ISO 12100:2010',
      'EN ISO 16090-1:2022',
      'EN ISO 23125:2015',
      'EN 60204-1:2018',
      'EN ISO 13849-1:2023 (PL d, Kat. 3)',
    ],
    hazard:
      'Yüksek devirli fener mili (spindle) ve döner aynaya temas, parça/takım fırlaması, talaş konveyörü sıkışması ve soğutma sıvısı buharı.',
    severity: 5,
    probability: 2,
    pl: 'PL d (Kategori 3)',
    protectiveMeasures:
      '1. Darbe dayanımlı kabin: EN ISO 16090-1 polikarbonat darbe dayanımlı gözetleme pencereli tam kapalı kabin.\n' +
      '2. Mil duruş izleme: Fener mili sıfır hız (zero-speed monitoring) algılanmadan açılmayan solenoid kilitlemeli emniyet şalteri.',
    residualRisk:
      'Parça bağlama ve sıfırlama modunda (Mode 2) kapı açıkken fener mili devri ve eksen ilerleme hızı güvenli sınırda tutulmalıdır.',
    requiredTests: [
      'Fener mili sıfır hız kapı kilidi açılma gecikme testi',
      'STO (Safe Torque Off) ve güvenli hız izleme (SLS) doğrulaması',
      'EN 60204-1 kaçak akım ve yalıtım testi',
    ],
  },
];

@Injectable()
export class MachineCeAiService {
  private readonly logger = new Logger(MachineCeAiService.name);

  async analyzeMachine(input: AiAnalyzeMachineInput): Promise<AiAnalyzeMachineOutput> {
    const fallback = this.expertAnalyzeMachine(input);
    if (!process.env.GEMINI_API_KEY) {
      return fallback;
    }

    try {
      const prompt = [
        'Sen 2006/42/EC Makine Emniyeti Yönetmeliği, AB 2023/1230 Makine Tüzüğü ve EN ISO 12100 konusunda uzman bir Baş CE Başdenetçisisin.',
        `Makine Adı: ${input.name}`,
        input.machineType ? `Makine Tipi: ${input.machineType}` : '',
        input.location ? `Tesis / Konum: ${input.location}` : '',
        input.hazardHint ? `Mevcut Tehlike Notu: ${input.hazardHint}` : '',
        'Bu makine için teknik olarak eksiksiz, Türkçe, gerçek A/B/C tipi harmonize standartları içeren bir EN ISO 12100 risk ve CE uyumluluk analizi üret.',
        'severity ve probability 1 ile 5 arasında tam sayı olmalıdır.',
      ]
        .filter(Boolean)
        .join('\n');

      const schema = {
        type: 'object',
        required: [
          'machineType',
          'directive',
          'standardRefs',
          'hazard',
          'severity',
          'probability',
          'performanceLevel',
          'protectiveMeasures',
          'residualRisk',
          'requiredTests',
          'notes',
        ],
        properties: {
          machineType: { type: 'string' },
          directive: { type: 'string' },
          standardRefs: { type: 'array', items: { type: 'string' } },
          hazard: { type: 'string' },
          severity: { type: 'integer' },
          probability: { type: 'integer' },
          performanceLevel: { type: 'string' },
          protectiveMeasures: { type: 'string' },
          residualRisk: { type: 'string' },
          requiredTests: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
        },
      };

      const raw = await this.callGemini<Omit<AiAnalyzeMachineOutput, 'provider' | 'riskScore'>>(
        prompt,
        schema,
      );
      const severity = Math.min(5, Math.max(1, Number(raw.severity) || fallback.severity));
      const probability = Math.min(5, Math.max(1, Number(raw.probability) || fallback.probability));
      return {
        provider: 'gemini',
        machineType: raw.machineType || fallback.machineType,
        directive: raw.directive || fallback.directive,
        standardRefs: raw.standardRefs?.length ? raw.standardRefs : fallback.standardRefs,
        hazard: raw.hazard || fallback.hazard,
        severity,
        probability,
        riskScore: severity * probability,
        performanceLevel: raw.performanceLevel || fallback.performanceLevel,
        protectiveMeasures: raw.protectiveMeasures || fallback.protectiveMeasures,
        residualRisk: raw.residualRisk || fallback.residualRisk,
        requiredTests: raw.requiredTests?.length ? raw.requiredTests : fallback.requiredTests,
        notes: raw.notes || fallback.notes,
      };
    } catch (error) {
      this.logger.warn(`AI analyzeMachine fallback triggered: ${(error as Error).message}`);
      return fallback;
    }
  }

  async auditPortfolio(records: MachineCeRecord[]): Promise<AiPortfolioAuditOutput> {
    const active = records.filter((r) => !r.archivedAt);
    const fallback = this.expertAuditPortfolio(active);
    if (!process.env.GEMINI_API_KEY || active.length === 0) {
      return fallback;
    }

    try {
      const summaryLines = active.slice(0, 30).map((r) => {
        const score = r.riskScore ?? (r.severity && r.probability ? r.severity * r.probability : null);
        return `- [${r.kind}] ${r.name} (${r.location}) | Durum: ${r.status} | Risk: ${score ?? 'Yok'} | Standartlar: ${(r.standardRefs ?? []).join(', ') || 'Yok'} | Kanıt: ${(r.documentRefs ?? []).length}`;
      });
      const prompt = [
        'Sen bir Makine Emniyeti ve CE Teknik Dosya Başdenetçisisin. Aşağıdaki fabrika makine parkuru ve CE kayıtlarını incele:',
        `Toplam Aktif Kayıt: ${active.length}`,
        ...summaryLines,
        'Fabrikanın CE denetim hazırlığını yorumla: tespit edilen somut boşlukları (gaps), öncelikli düzeltici aksiyonları (recommendations) ve yeni AB 2023/1230 Makine Tüzüğü geçiş önerilerini (regulation2023Notes) Türkçe olarak üret.',
      ].join('\n');

      const schema = {
        type: 'object',
        required: ['headline', 'readinessScore', 'gaps', 'recommendations', 'regulation2023Notes'],
        properties: {
          headline: { type: 'string' },
          readinessScore: { type: 'integer' },
          gaps: { type: 'array', items: { type: 'string' } },
          recommendations: { type: 'array', items: { type: 'string' } },
          regulation2023Notes: { type: 'array', items: { type: 'string' } },
        },
      };

      const raw = await this.callGemini<Omit<AiPortfolioAuditOutput, 'provider'>>(prompt, schema);
      return {
        provider: 'gemini',
        headline: raw.headline || fallback.headline,
        readinessScore: Math.min(100, Math.max(0, Number(raw.readinessScore) || fallback.readinessScore)),
        gaps: raw.gaps?.length ? raw.gaps : fallback.gaps,
        recommendations: raw.recommendations?.length ? raw.recommendations : fallback.recommendations,
        regulation2023Notes: raw.regulation2023Notes?.length
          ? raw.regulation2023Notes
          : fallback.regulation2023Notes,
      };
    } catch (error) {
      this.logger.warn(`AI auditPortfolio fallback triggered: ${(error as Error).message}`);
      return fallback;
    }
  }

  async askCopilot(input: AiCopilotAskInput): Promise<AiCopilotAskOutput> {
    const fallback = this.expertAskCopilot(input);
    if (!process.env.GEMINI_API_KEY) {
      return fallback;
    }

    try {
      const prompt = [
        'Sen 2006/42/EC, AB 2023/1230, EN ISO 12100, EN 60204-1 ve EN ISO 13849-1 uzmanı bir Makine CE Başmühendisisin.',
        `Kullanıcı Sorusu: ${input.question}`,
        input.contextMachineName ? `İlgili Makine Bağlamı: ${input.contextMachineName}` : '',
        'Soruyu net, mühendislik düzeyinde Türkçe yanıtla; ilgili harmonize standartları, doğrulama kontrol listesini ve bu konuya uygun örnek bir CE kayıt taslağını (suggestedDraft) üret.',
      ]
        .filter(Boolean)
        .join('\n');

      const schema = {
        type: 'object',
        required: ['title', 'answer', 'referencedStandards', 'checklist', 'suggestedDraft'],
        properties: {
          title: { type: 'string' },
          answer: { type: 'string' },
          referencedStandards: { type: 'array', items: { type: 'string' } },
          checklist: { type: 'array', items: { type: 'string' } },
          suggestedDraft: {
            type: 'object',
            required: [
              'name',
              'machineType',
              'directive',
              'standardRefs',
              'hazard',
              'severity',
              'probability',
              'protectiveMeasures',
              'residualRisk',
            ],
            properties: {
              name: { type: 'string' },
              machineType: { type: 'string' },
              directive: { type: 'string' },
              standardRefs: { type: 'array', items: { type: 'string' } },
              hazard: { type: 'string' },
              severity: { type: 'integer' },
              probability: { type: 'integer' },
              protectiveMeasures: { type: 'string' },
              residualRisk: { type: 'string' },
            },
          },
        },
      };

      const raw = await this.callGemini<Omit<AiCopilotAskOutput, 'provider'>>(prompt, schema);
      return {
        provider: 'gemini',
        title: raw.title || fallback.title,
        answer: raw.answer || fallback.answer,
        referencedStandards: raw.referencedStandards?.length
          ? raw.referencedStandards
          : fallback.referencedStandards,
        checklist: raw.checklist?.length ? raw.checklist : fallback.checklist,
        suggestedDraft: raw.suggestedDraft || fallback.suggestedDraft,
      };
    } catch (error) {
      this.logger.warn(`AI askCopilot fallback triggered: ${(error as Error).message}`);
      return fallback;
    }
  }

  private expertAnalyzeMachine(input: AiAnalyzeMachineInput): AiAnalyzeMachineOutput {
    const combined = `${input.name} ${input.machineType ?? ''} ${input.hazardHint ?? ''}`;
    const matched = KNOWLEDGE_BASE.find((rule) => rule.keywords.test(combined));

    if (matched) {
      const score = matched.severity * matched.probability;
      return {
        provider: 'expert-engine',
        machineType: input.machineType?.trim() || matched.machineType,
        directive: matched.directive,
        standardRefs: [...matched.standards],
        hazard: matched.hazard,
        severity: matched.severity,
        probability: matched.probability,
        riskScore: score,
        performanceLevel: matched.pl,
        protectiveMeasures: matched.protectiveMeasures,
        residualRisk: matched.residualRisk,
        requiredTests: [...matched.requiredTests],
        notes: `AI Mühendislik Analizi (${matched.pl}):\n• Zorunlu Testler: ${matched.requiredTests.join(' | ')}\n• Teknik dosya Ek VII kapsamında elektrik/pnömatik devre şemaları ve SISTEMA PL doğrulama raporu arşivlenmelidir.`,
      };
    }

    const severity = 4;
    const probability = 2;
    const requiredTests = [
      'EN 60204-1 Madde 18.2 koruyucu topraklama süreklilik testi',
      'EN ISO 13850 acil durdurma (Stop Kategori 0/1) fonksiyon doğrulaması',
      'EN ISO 13849-2 emniyet kontrol devresi hata enjeksiyon ve doğrulama testi',
    ];
    return {
      provider: 'expert-engine',
      machineType: input.machineType?.trim() || 'Endüstriyel Üretim Makinesi',
      directive: '2006/42/EC, AB 2023/1230, 2014/30/EU (EMC)',
      standardRefs: [
        'EN ISO 12100:2010',
        'EN 60204-1:2018',
        'EN ISO 13849-1:2023 (PL d)',
        'EN ISO 13850:2015',
        'EN ISO 13857:2019',
        'EN ISO 14120:2015',
      ],
      hazard:
        'Hareketli aktarma organları ve çalışma bölgesinde mekanik sıkışma/ezilme, bakım sırasında beklenmedik enerji boşalması ve elektrik panosu dolaylı temas tehlikesi.',
      severity,
      probability,
      riskScore: severity * probability,
      performanceLevel: 'PL d (Kategori 3)',
      protectiveMeasures:
        '1. Tasarımla güvenlik: Hareketli tahrik noktalarının EN ISO 13857 güvenli erişim mesafelerine göre kapatılması.\n' +
        '2. Teknik koruma: EN ISO 14120 sabit muhafazalar, erişim kapılarında EN ISO 14119 kilitlemeli emniyet şalterleri ve çift kanallı emniyet rölesi (PL d).\n' +
        '3. Acil durdurma: Operatör istasyonlarında EN ISO 13850 uyumlu mantar başlı acil durdurma butonları.',
      residualRisk:
        'Bakım ve temizlik öncesi ana enerji kesici ve pnömatik valf üzerinde LOTO (Kilitleme/Etiketleme) uygulanmalı; makine üzerinde ISO 7010 uyarı etiketleri görünür tutulmalıdır.',
      requiredTests,
      notes: `AI Mühendislik Analizi (PL d):\n• Zorunlu Testler: ${requiredTests.join(' | ')}\n• 2006/42/EC Ek VII ve AB 2023/1230 kapsamında Türkçe kullanım kılavuzu ve AT Uygunluk Beyanı teknik dosyaya eklenmelidir.`,
    };
  }

  private expertAuditPortfolio(records: MachineCeRecord[]): AiPortfolioAuditOutput {
    if (records.length === 0) {
      return {
        provider: 'expert-engine',
        headline:
          'Çalışma alanında henüz aktif makine veya risk kaydı bulunmuyor; ilk makine envanterini oluşturarak veya CSV şablonuyla toplu aktararak CE kanıt zincirini başlatın.',
        readinessScore: 100,
        gaps: [
          'Makine envanteri ve EN ISO 12100 risk değerlendirmesi kayıtları henüz girilmemiş.',
          '2006/42/EC Ek VII kapsamında zorunlu teknik dosya ve AT uygunluk beyanı kaydı oluşturulmamış.',
        ],
        recommendations: [
          'Yeni Kayıt çekmecesindeki "AI ile EN ISO 12100 Analizi Üret" butonunu kullanarak ilk makinenizi 30 saniyede tanımlayın.',
          'Mevcut fabrika makine listesini "Toplu İçe Aktar (CSV)" aracıyla tek seferde sisteme aktarın.',
          'Her makine için EN 60204-1 elektriksel test raporunu ve devre şemasını "Teknik Dosya Belge Ekleri" bölümüne yükleyin.',
        ],
        regulation2023Notes: [
          'AB 2023/1230 Makine Tüzüğü (20 Ocak 2027 yürürlük): Dijital kullanım kılavuzu ve AB Uygunluk Beyanı erişim bağlantısını makine kimlik plakasına ekleyin.',
          'Ağa bağlı veya uzaktan erişimli PLC/CNC makineler için EN IEC 62443 siber güvenlik ve yazılım bütünlüğü kontrollerini teknik dosyaya dahil edin.',
        ],
      };
    }

    const highRisk = records.filter((r) => {
      const s = r.riskScore ?? (r.severity && r.probability ? r.severity * r.probability : 0);
      return s >= 15;
    });
    const missingMeasures = records.filter((r) => !r.protectiveMeasures?.trim());
    const missingDocs = records.filter((r) => !(r.documentRefs?.length || r.attachments?.length));
    const missingStandards = records.filter((r) => !r.standardRefs?.length);
    const unapproved = records.filter((r) => r.status !== 'approved');

    const gaps: string[] = [];
    if (highRisk.length > 0) {
      gaps.push(
        `${highRisk.length} kayıtta yüksek risk skoru (≥15) tespit edildi (${highRisk
          .slice(0, 3)
          .map((r) => r.name)
          .join(', ')}); PL d/e emniyet fonksiyonu doğrulaması önceliklendirilmelidir.`,
      );
    }
    if (missingMeasures.length > 0) {
      gaps.push(
        `${missingMeasures.length} kayıtta EN ISO 12100 3-adım koruyucu tedbir açıklaması eksik.`,
      );
    }
    if (missingDocs.length > 0) {
      gaps.push(
        `${missingDocs.length} kayıtta kanıt belge kodu veya yüklenmiş teknik dosya eki (şema/test raporu) bulunmuyor.`,
      );
    }
    if (missingStandards.length > 0) {
      gaps.push(
        `${missingStandards.length} kayıtta referans harmonize standart (A/B/C tipi) tanımlanmamış.`,
      );
    }
    if (gaps.length === 0) {
      gaps.push(
        'Tüm aktif kayıtlarda temel standart, koruyucu tedbir ve kanıt referansları tanımlanmış durumda.',
      );
    }

    const actionReqCount = records.filter((r) =>
      ['action-required', 'rejected'].includes(r.status),
    ).length;
    const penalty =
      actionReqCount * 12 + missingMeasures.length * 5 + missingDocs.length * 4 + highRisk.length * 4;
    const readinessScore = Math.max(42, Math.min(100, 100 - Math.round(penalty / Math.max(1, records.length / 2))));

    return {
      provider: 'expert-engine',
      headline: `${records.length} aktif CE kaydı incelendi: %${readinessScore} denetim hazırlığı, ${
        records.length - unapproved.length
      } onaylı kanıt ve ${highRisk.length} yüksek riskli odak noktası tespit edildi.`,
      readinessScore,
      gaps,
      recommendations: [
        missingMeasures.length > 0
          ? 'Koruyucu tedbiri eksik kayıtları açıp "AI ile EN ISO 12100 Risk & Standart Analizi Üret" aracıyla otomatik tamamlayın.'
          : 'Mevcut koruyucu tedbirlerin SISTEMA / EN ISO 13849-1 PL doğrulama hesaplarını yıllık olarak gözden geçirin.',
        missingDocs.length > 0
          ? 'Kanıt eki eksik makinelere EN 60204-1 elektriksel güvenlik testi ve devre şeması PDF dosyalarını yükleyin.'
          : 'Yüklenen teknik dosya eklerinin sürüm numaralarını AT Uygunluk Beyanı PDF çıktısıyla çapraz doğrulayın.',
        'Onaylanan tüm makineler için tablodaki PDF ikonuyla "AT Uygunluk Beyanı & Teknik Dosya Föyü" çıktısını alıp imzalı kopyasını arşivleyin.',
      ],
      regulation2023Notes: [
        'AB 2023/1230 Geçişi: "Önemli değişiklik" (substantial modification) yapılan makinelerde emniyet kontrol sistemi etkileniyorsa yeni CE değerlendirmesi zorunludur.',
        'Siber Güvenlik (Ek III 1.1.9): USB, Ethernet veya bulut bağlantılı makinelerde emniyet fonksiyonlarının dış müdahaleye karşı korunduğu kanıtlanmalıdır.',
        'Yapay Zekâ & Otonom Fonksiyonlar: Kendi kendine öğrenen veya otonom hareket eden robotik hücrelerde sınır değer aşımı donanımsal emniyet devresiyle sınırlandırılmalıdır.',
      ],
    };
  }

  private expertAskCopilot(input: AiCopilotAskInput): AiCopilotAskOutput {
    const q = input.question.toLocaleLowerCase('tr-TR');
    const machineAnalysis = this.expertAnalyzeMachine({
      name: input.contextMachineName || input.question,
    });

    if (q.includes('2023/1230') || q.includes('yeni makine tüzüğü') || q.includes('fark')) {
      return {
        provider: 'expert-engine',
        title: '2006/42/EC Makine Direktifi ile AB 2023/1230 Makine Tüzüğü Karşılaştırması',
        answer:
          'AB 2023/1230 Makine Tüzüğü, 2006/42/EC Direktifinin yerini alarak tüm AB üye ülkelerinde doğrudan kanun hükmünde uygulanır (tam yürürlük: 20 Ocak 2027). En kritik değişiklikler: (1) "Önemli Değişiklik" (Substantial Modification) kavramının yasal tanımı ve revizyon yapan işletmenin imalatçı sayılması, (2) Emniyet kontrol sistemlerinin siber saldırılara karşı korunması (EN IEC 62443), (3) Yapay zekâ ve otonom makineler için yüksek riskli Ek I kapsamı, (4) Dijital kullanım kılavuzu ve dijital AB Uygunluk Beyanı (EU DoC) izni.',
        referencedStandards: [
          'AB 2023/1230 (EU Machinery Regulation)',
          '2006/42/EC (Machinery Directive)',
          'EN ISO 12100:2010',
          'EN IEC 62443-3-3',
          'EN ISO 13849-1:2023',
        ],
        checklist: [
          'AT Uygunluk Beyanı şablonunu AB Uygunluk Beyanı (EU DoC) ve 2023/1230 referansıyla güncelleyin.',
          'Ağa bağlı PLC ve HMI sistemleri için siber güvenlik risk değerlendirmesini teknik dosyaya ekleyin.',
          'Revizyon yapılan hatlarda emniyet mesafesi veya hız değişimi varsa önemli değişiklik analizini kayıt altına alın.',
          'Dijital kullanım kılavuzunun en az 10 yıl erişilebilir olacağını doğrulayın.',
        ],
        suggestedDraft: {
          name: input.contextMachineName || 'AB 2023/1230 Geçiş ve Siber Güvenlik Değerlendirmesi',
          machineType: machineAnalysis.machineType,
          directive: 'AB 2023/1230, 2006/42/EC',
          standardRefs: ['EN ISO 12100:2010', 'EN ISO 13849-1:2023', 'EN IEC 62443-3-3', 'EN 60204-1:2018'],
          hazard:
            'Ağ bağlantılı kontrol sistemine yetkisiz erişim, parametre değiştirilmesi ve revizyon sonrası emniyet fonksiyonu kaybı.',
          severity: 4,
          probability: 2,
          protectiveMeasures:
            'Emniyet PLC ile standart PLC ağ ayrımı, parola/RFID yetkilendirme, yazılım sağlama toplamı (CRC) izleme ve fiziksel donanım kilidi.',
          residualRisk:
            'Uzaktan bakım bağlantısı yalnızca sahadaki operatörün fiziksel anahtarlı şalter onayıyla açılmalıdır.',
        },
      };
    }

    if (q.includes('60204') || q.includes('elektrik') || q.includes('test') || q.includes('pano')) {
      return {
        provider: 'expert-engine',
        title: 'EN 60204-1 Makine Elektrik Donanımı Zorunlu Test ve Doğrulama Rehberi',
        answer:
          'EN 60204-1:2018 Madde 18 kapsamında her makinenin CE onayı öncesinde elektriksel güvenlik testlerinin yapılması ve sonuçlarının teknik dosyada saklanması zorunludur. Temel zorunlu doğrulamalar: (1) Koruyucu bağlama devresinin (PE topraklama) sürekliliği (en az 10 A akımla ölçüm), (2) Yalıtım direnci testi (500 V DC ile en az 1 MΩ), (3) Gerilim dayanım testi, (4) Besleme kesildikten sonra kalan (artık) gerilimin 60 V altına 5 saniye içinde düşmesi ve (5) Acil durdurma / STO fonksiyon testleridir.',
        referencedStandards: [
          'EN 60204-1:2018 Madde 18',
          'EN ISO 13850:2015',
          'EN ISO 13849-1:2023',
          '2014/35/EU (LVD)',
        ],
        checklist: [
          'PE topraklama barası ile tüm metal gövde parçaları arasında süreklilik ölçümü yapın.',
          'Güç devreleri ile PE arasında 500 V DC ile ≥ 1 MΩ yalıtım direnci doğrulayın.',
          'Ana şalter kapatıldığında kondansatör uçlarında < 5 sn içinde ≤ 60 V deşarj ölçün.',
          'Test protokolünü PDF olarak imzalayıp MachineCE Teknik Dosya Ekleri bölümüne yükleyin.',
        ],
        suggestedDraft: {
          name: input.contextMachineName || 'EN 60204-1 Elektriksel Güvenlik Test & Doğrulama Kaydı',
          machineType: machineAnalysis.machineType,
          directive: '2006/42/EC, 2014/35/EU (LVD), 2014/30/EU (EMC)',
          standardRefs: ['EN 60204-1:2018', 'EN ISO 13850:2015', 'EN ISO 12100:2010'],
          hazard:
            'İzolasyon hatası sonucu gövdeye kaçak akım, pano içi ark/elektrik çarpması ve kondansatör artık gerilimi.',
          severity: 5,
          probability: 2,
          protectiveMeasures:
            'Kilitlenebilir ana enerji kesici şalter, IP54 elektrik panosu, PE eşpotansiyel topraklama, hızlı deşarj direnci ve Kategori 0/1 acil durdurma devresi.',
          residualRisk:
            'Pano kapağı yalnızca yetkili elektrik mühendisi tarafından özel anahtarla açılmalı ve LOTO uygulanmalıdır.',
        },
      };
    }

    if (q.includes('13855') || q.includes('ışık perdesi') || q.includes('emniyet mesafesi')) {
      return {
        provider: 'expert-engine',
        title: 'EN ISO 13855 Emniyet Mesafesi (S = K × T + C) Hesaplama Kriterleri',
        answer:
          'EN ISO 13855 standardına göre ışık perdesi, alan tarayıcı veya çift el kumanda ile tehlike bölgesi arasındaki minimum emniyet mesafesi S = (K × T) + C formülüyle hesaplanır. Burada K = yaklaşım hızı (el için 2000 mm/s, vücut için 1600 mm/s), T = toplam sistem duruş süresi (ışık perdesi tepki süresi + emniyet PLC/röle süresi + valf/fren duruş süresi) ve C = çözünürlüğe bağlı ilave erişim mesafesidir (14 mm parmak koruma için C = 0 mm, 30 mm el koruma için C = 8 × (d - 14) = 128 mm).',
        referencedStandards: [
          'EN ISO 13855:2010',
          'EN ISO 13849-1:2023',
          'EN 61496-1 (ESPE Tip 4)',
          'EN ISO 12100:2010',
        ],
        checklist: [
          'Duruş süresi ölçüm cihazı ile makinenin en kötü durum duruş süresini (T) milisaniye cinsinden ölçün.',
          'Işık perdesi çözünürlüğüne (14 mm veya 30 mm) göre C katsayısını belirleyin.',
          'S < 500 mm çıktığında K = 2000 mm/s kullanarak mesafeyi doğrulayın (minimum 100 mm).',
          'Işık perdesinin arkasından dolanmayı (reaching over/under) fiziksel bariyerle engelleyin.',
        ],
        suggestedDraft: {
          name: input.contextMachineName || 'EN ISO 13855 Optoelektronik Emniyet Mesafesi Doğrulaması',
          machineType: machineAnalysis.machineType,
          directive: '2006/42/EC, AB 2023/1230',
          standardRefs: ['EN ISO 13855:2010', 'EN 61496-1', 'EN ISO 13849-1:2023 (PL e)', 'EN ISO 12100:2010'],
          hazard:
            'Operatör elinin makine tam durmadan önce tehlikeli hareket bölgesine ulaşması.',
          severity: 5,
          probability: 2,
          protectiveMeasures:
            'Tip 4 14 mm çözünürlüklü ışık perdesi (PL e), S = (2000 × T) + C formülüyle doğrulanan montaj mesafesi ve mekanik arka erişim engelleyici.',
          residualRisk:
            'Fren aşınmasına karşı 6 ayda bir duruş süresi (stopping time) periyodik ölçümü tekrarlanmalıdır.',
        },
      };
    }

    return {
      provider: 'expert-engine',
      title: `${machineAnalysis.machineType} — EN ISO 12100 & CE Uyumluluk Rehberi`,
      answer: `${input.question} kapsamında makine emniyeti değerlendirmesi ${machineAnalysis.directive} ve ${machineAnalysis.standardRefs.slice(0, 4).join(', ')} standartlarına göre yürütülmelidir. Önerilen emniyet performans seviyesi ${machineAnalysis.performanceLevel} olup; tehlike analizi, 3-adım koruyucu tedbirler ve zorunlu doğrulama testleri aşağıda yapılandırılmıştır.`,
      referencedStandards: machineAnalysis.standardRefs,
      checklist: [
        ...machineAnalysis.requiredTests,
        '2006/42/EC Ek VII teknik dosyasını ve AT Uygunluk Beyanını onaylayın.',
      ],
      suggestedDraft: {
        name: input.contextMachineName || input.question.slice(0, 90),
        machineType: machineAnalysis.machineType,
        directive: machineAnalysis.directive,
        standardRefs: machineAnalysis.standardRefs,
        hazard: machineAnalysis.hazard,
        severity: machineAnalysis.severity,
        probability: machineAnalysis.probability,
        protectiveMeasures: machineAnalysis.protectiveMeasures,
        residualRisk: machineAnalysis.residualRisk,
      },
    };
  }

  private async callGemini<T>(prompt: string, schema: Record<string, unknown>): Promise<T> {
    const key = process.env.GEMINI_API_KEY!;
    const model = process.env.MACHINE_CE_GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`;
    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${prompt}\n\nYanıtı yalnızca şu JSON şemasına uyan geçerli bir JSON nesnesi olarak döndür:\n${JSON.stringify(schema)}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 4096,
        temperature: 0.4,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    return JSON.parse(text) as T;
  }
}
