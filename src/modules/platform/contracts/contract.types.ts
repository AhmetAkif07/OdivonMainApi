import { ProductModule } from '../../../shared/authorization/constants';

/** Sözleşme türleri. `sales` her ürünün ana satış (abonelik) sözleşmesidir. */
export const CONTRACT_KINDS = [
  'sales',
  'distance_sales',
  'pre_information',
  'kvkk_notice',
  'data_processing',
  'terms_of_use',
  'sla',
  'other',
] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];

export const CONTRACT_KIND_LABELS: Record<ContractKind, string> = {
  sales: 'Satış (Abonelik) Sözleşmesi',
  distance_sales: 'Mesafeli Satış Sözleşmesi',
  pre_information: 'Ön Bilgilendirme Formu',
  kvkk_notice: 'KVKK Aydınlatma Metni',
  data_processing: 'Veri İşleme Sözleşmesi',
  terms_of_use: 'Kullanım Koşulları',
  sla: 'Hizmet Seviyesi Taahhüdü (SLA)',
  other: 'Diğer',
};

export const CONTRACT_STATUSES = ['draft', 'active', 'archived'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** Maddenin konusu; panelde "sorumluluk" grupları olarak gösterilir. */
export const CLAUSE_CATEGORIES = [
  'parties',
  'subject',
  'provider_obligations',
  'customer_obligations',
  'liability',
  'data_protection',
  'payment',
  'termination',
  'withdrawal',
  'force_majeure',
  'intellectual_property',
  'dispute',
  'general',
] as const;
export type ClauseCategory = (typeof CLAUSE_CATEGORIES)[number];

export const CLAUSE_CATEGORY_LABELS: Record<ClauseCategory, string> = {
  parties: 'Taraflar',
  subject: 'Konu ve Kapsam',
  provider_obligations: 'Odivon’un Yükümlülükleri',
  customer_obligations: 'Müşterinin Yükümlülükleri',
  liability: 'Sorumluluğun Sınırlandırılması',
  data_protection: 'Kişisel Veriler (KVKK)',
  payment: 'Ücret ve Ödeme',
  termination: 'Süre ve Fesih',
  withdrawal: 'Cayma Hakkı',
  force_majeure: 'Mücbir Sebep',
  intellectual_property: 'Fikri Mülkiyet',
  dispute: 'Uyuşmazlık Çözümü',
  general: 'Genel Hükümler',
};

/** `all` = tüm ürünlerde geçerli genel sözleşme. */
export type ContractProduct = ProductModule | 'all';

export interface ContractClause {
  id: string;
  title: string;
  body: string;
  category: ClauseCategory;
  /** Kütüphaneden geldiyse örnek maddenin id'si. */
  sampleId?: string | null;
}

/** platformContracts/{id} */
export interface PlatformContract {
  id: string;
  title: string;
  kind: ContractKind;
  product: ContractProduct;
  version: string;
  status: ContractStatus;
  summary: string | null;
  clauses: ContractClause[];
  /** Müşterinin satın alırken onay kutusuyla kabul etmesi gerekir mi. */
  requiresAcceptance: boolean;
  /** Hukukçu tarafından gözden geçirildi işareti. Örnek metinlerden oluşan taslaklarda false başlar. */
  legalReviewed: boolean;
  legalReviewedBy: string | null;
  legalReviewedAt: string | null;
  effectiveFrom: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

/** platformSettings/contractParty: sözleşmelerde "Satıcı / Hizmet Sağlayıcı" bilgileri. */
export interface ContractPartySettings {
  companyName: string;
  shortName: string;
  address: string;
  taxOffice: string;
  taxNumber: string;
  mersisNo: string;
  email: string;
  phone: string;
  kepAddress: string;
  website: string;
  jurisdiction: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const EMPTY_PARTY: ContractPartySettings = {
  companyName: '',
  shortName: 'Odivon',
  address: '',
  taxOffice: '',
  taxNumber: '',
  mersisNo: '',
  email: 'info@odivon.com',
  phone: '',
  kepAddress: '',
  website: 'https://odivon.com',
  jurisdiction: 'İstanbul (Çağlayan)',
};
