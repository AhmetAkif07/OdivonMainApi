const TR_MAP: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
};

/** URL-safe slug (`odivonpro-hair-kadikoy`) from a display name; Turkish letters are transliterated. */
export function slugify(input: string): string {
  const lowered = input.toLocaleLowerCase('tr');
  const ascii = Array.from(lowered)
    .map((char) => TR_MAP[char] ?? char)
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return ascii
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/** Candidate for the n-th attempt: `base`, `base-2`, `base-3`, ... (kept within 80 chars). */
export function slugCandidate(base: string, attempt: number): string {
  if (attempt <= 1) return base;
  const suffix = `-${attempt}`;
  return `${base.slice(0, 80 - suffix.length)}${suffix}`;
}
