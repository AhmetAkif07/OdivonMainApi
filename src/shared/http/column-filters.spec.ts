import { matchesColumnFilters, parseColumnFilters } from './column-filters';

describe('column filters', () => {
  it('parses a JSON string of non-empty filters', () => {
    expect(parseColumnFilters('{"firstName":" Ahmet "}')).toEqual({ firstName: 'Ahmet' });
  });

  it('ignores empty and invalid payloads', () => {
    expect(parseColumnFilters('')).toBeUndefined();
    expect(parseColumnFilters('{}')).toBeUndefined();
    expect(parseColumnFilters('not-json')).toBeUndefined();
  });

  it('matches contains against strings and booleans', () => {
    const item = { firstName: 'Ahmet', isArchive: false };
    expect(matchesColumnFilters(item, { firstName: 'ahme' })).toBe(true);
    expect(matchesColumnFilters(item, { firstName: 'mehmet' })).toBe(false);
    expect(matchesColumnFilters(item, { isArchive: 'hayır' })).toBe(true);
    expect(matchesColumnFilters(item, { isArchive: 'evet' })).toBe(false);
  });
});
