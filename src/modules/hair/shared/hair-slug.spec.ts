import { slugCandidate, slugify } from './hair-slug';

describe('hair-slug', () => {
  it('transliterates Turkish letters', () => {
    expect(slugify('OdivonPro Hair Kadıköy')).toBe('odivonpro-hair-kadikoy');
    expect(slugify('  Şişli — Çiçek Sokağı!  ')).toBe('sisli-cicek-sokagi');
  });

  it('returns an empty string when nothing usable is left', () => {
    expect(slugify('***')).toBe('');
  });

  it('adds a numeric suffix for later attempts', () => {
    expect(slugCandidate('merkez', 1)).toBe('merkez');
    expect(slugCandidate('merkez', 3)).toBe('merkez-3');
    expect(slugCandidate('a'.repeat(80), 2)).toHaveLength(80);
  });
});
