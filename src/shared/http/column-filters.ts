export type ColumnFilters = Record<string, string>;

export function parseColumnFilters(value: unknown): ColumnFilters | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }
  const filters: ColumnFilters = {};
  for (const [key, raw] of Object.entries(parsed)) {
    if (!key.trim()) {
      continue;
    }
    if (typeof raw === 'string' && raw.trim()) {
      filters[key] = raw.trim();
      continue;
    }
    if (typeof raw === 'number' || typeof raw === 'boolean') {
      filters[key] = String(raw);
    }
  }
  return Object.keys(filters).length > 0 ? filters : undefined;
}

export function hasColumnFilters(filters?: ColumnFilters): filters is ColumnFilters {
  return !!filters && Object.keys(filters).length > 0;
}

export function columnSearchText(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'evet true 1' : 'hayır hayir false 0';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return value.toLocaleLowerCase('tr-TR');
  }
  if (Array.isArray(value)) {
    return value.map(columnSearchText).join(' ');
  }
  if (typeof value === 'object') {
    return Object.values(value).map(columnSearchText).join(' ');
  }
  return String(value).toLocaleLowerCase('tr-TR');
}

export function matchesColumnFilters<T>(
  item: T,
  filters: ColumnFilters | undefined,
  fieldValue?: (item: T, key: string) => unknown,
): boolean {
  if (!hasColumnFilters(filters)) {
    return true;
  }
  const record = item as Record<string, unknown>;
  for (const [key, term] of Object.entries(filters)) {
    const raw = fieldValue ? fieldValue(item, key) : record[key];
    const haystack = columnSearchText(raw);
    const needle = term.toLocaleLowerCase('tr-TR');
    if (!haystack.includes(needle)) {
      return false;
    }
  }
  return true;
}
