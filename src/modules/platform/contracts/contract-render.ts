import { CONTRACT_PLACEHOLDERS } from './contract-samples';
import { ContractClause, ContractPartySettings } from './contract.types';

const PLACEHOLDER_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Satıcı bilgilerinden yer tutucu değerleri. Boş alanlar doldurulmaz. */
export function partyVariables(party: ContractPartySettings): Record<string, string> {
  return {
    satici_unvan: party.companyName,
    satici_kisa_ad: party.shortName || party.companyName,
    satici_adres: party.address,
    satici_vergi_dairesi: party.taxOffice,
    satici_vergi_no: party.taxNumber,
    satici_mersis: party.mersisNo,
    satici_eposta: party.email,
    satici_telefon: party.phone,
    satici_kep: party.kepAddress,
    satici_web: party.website,
    yetkili_mahkeme: party.jurisdiction,
  };
}

/** Metindeki yer tutucu anahtarları (tekrarsız). */
export function placeholdersIn(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) found.add(match[1]);
  return [...found];
}

/**
 * Yer tutucuları doldurur. Değeri olmayanlar okunabilir bir etiketle köşeli parantez içinde bırakılır
 * (ör. "[Alıcı (işletme) unvanı]") ve `missing` listesinde döner.
 */
export function fillPlaceholders(text: string, vars: Record<string, string | undefined>) {
  const missing = new Set<string>();
  const result = text.replace(PLACEHOLDER_PATTERN, (_m, key: string) => {
    const value = vars[key]?.trim();
    if (value) return value;
    missing.add(key);
    const label = CONTRACT_PLACEHOLDERS.find((p) => p.key === key)?.label ?? key;
    return `[${label}]`;
  });
  return { text: result, missing: [...missing] };
}

export function renderClauses(clauses: ContractClause[], vars: Record<string, string | undefined>) {
  const missing = new Set<string>();
  const rendered = clauses.map((clause, index) => {
    const title = fillPlaceholders(clause.title, vars);
    const body = fillPlaceholders(clause.body, vars);
    [...title.missing, ...body.missing].forEach((k) => missing.add(k));
    return { no: index + 1, id: clause.id, category: clause.category, title: title.text, body: body.text };
  });
  return { clauses: rendered, missing: [...missing] };
}
