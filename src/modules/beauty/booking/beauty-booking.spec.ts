import { slugCandidate, slugify } from './beauty-booking.service';

describe('beauty-booking slug utils', () => {
  it('converts Turkish characters to ASCII and kebab-cases the string', () => {
    expect(slugify('Lumière Kadıköy & Güzellik Merkezi')).toBe('lumiere-kadikoy-guzellik-merkezi');
    expect(slugify('Şişli Çiçek Çıkmazı')).toBe('sisli-cicek-cikmazi');
    expect(slugify('Özlem Ağaç')).toBe('ozlem-agac');
  });

  it('handles empty and special characters gracefully', () => {
    expect(slugify('   ***   ')).toBe('');
    expect(slugify('---test---')).toBe('test');
  });

  it('generates candidates for collision resolution', () => {
    expect(slugCandidate('lumiere', 1)).toBe('lumiere');
    expect(slugCandidate('lumiere', 2)).toBe('lumiere-2');
    expect(slugCandidate('lumiere', 5)).toBe('lumiere-5');
  });
});
