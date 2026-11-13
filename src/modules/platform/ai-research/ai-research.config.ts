/**
 * Odivon AI pazar araştırması: şehir/ilçe listesi ve sabitler.
 * OdivonAI/src/config.ts ile aynı tutulmalı (runner aynı şehir anahtarlarını bekler).
 */
export const AI_RESEARCH_CITIES: Record<string, { name: string; districts: string[] }> = {
  antalya: {
    name: 'Antalya',
    districts: [
      'Muratpaşa', 'Konyaaltı', 'Kepez', 'Döşemealtı', 'Aksu',
      'Alanya', 'Manavgat', 'Serik', 'Kemer', 'Kumluca',
      'Finike', 'Kaş', 'Demre', 'Elmalı', 'Korkuteli',
      'Gazipaşa', 'Akseki', 'Gündoğmuş', 'İbradı',
    ],
  },
};

export const AI_RESEARCH_DEFAULT_KEYWORDS = ['spor salonu', 'fitness', 'gym', 'pilates stüdyosu', 'crossfit'];

export const AI_RESEARCH_SOURCES = ['gmaps', 'osm'] as const;
export const AI_LEAD_PRIORITIES = ['sicak', 'ilik', 'soguk'] as const;

export const AI_RUN_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'] as const;
export type AiRunStatus = (typeof AI_RUN_STATUSES)[number];

/** Satış hunisi: runner hiç dokunmaz, sadece panelden değişir. */
export const AI_LEAD_PIPELINE_STATUSES = [
  'new', 'contacted', 'replied', 'demo', 'won', 'lost', 'ignored',
] as const;
export type AiLeadPipelineStatus = (typeof AI_LEAD_PIPELINE_STATUSES)[number];

/** Runner'ın kalp atışı bu belgeye yazılır (platformSettings koleksiyonu). */
export const AI_RUNNER_SETTINGS_DOC = 'aiResearchRunner';
/** Bu süreden eski kalp atışı = runner çevrimdışı. */
export const AI_RUNNER_OFFLINE_AFTER_MS = 90_000;
