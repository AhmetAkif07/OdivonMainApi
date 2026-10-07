import { maskPhone, normalizePhone } from './hair-phone';

describe('hair-phone', () => {
  it('normalises Turkish numbers to E.164', () => {
    expect(normalizePhone('0532 123 45 67')).toBe('+905321234567');
    expect(normalizePhone('532-123-4567')).toBe('+905321234567');
    expect(normalizePhone('90 532 123 45 67')).toBe('+905321234567');
    expect(normalizePhone('+90 (532) 123 45 67')).toBe('+905321234567');
    expect(normalizePhone('0049 30 1234567')).toBe('+49301234567');
  });

  it('rejects things that are not phone numbers', () => {
    expect(normalizePhone('12')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });

  it('masks all but the first and last two digits', () => {
    expect(maskPhone('+905321234567')).toBe('+90 5** *** **67');
  });
});
