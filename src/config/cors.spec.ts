import { allowedCorsOrigins, isCorsOriginAllowed } from './cors';

describe('CORS origins', () => {
  const allowed = allowedCorsOrigins('https://extra.example.com/, *');

  it('allows the hair client and local dev servers', () => {
    expect(isCorsOriginAllowed('https://hair.odivon.com', allowed)).toBe(true);
    expect(isCorsOriginAllowed('https://beauty.odivon.com', allowed)).toBe(true);
    expect(isCorsOriginAllowed('https://farm.odivon.com', allowed)).toBe(true);
    expect(isCorsOriginAllowed('http://localhost:4200', allowed)).toBe(true);
    expect(isCorsOriginAllowed('http://127.0.0.1:8080', allowed)).toBe(true);
  });

  it('adds CORS_ORIGIN entries but never a wildcard', () => {
    expect(isCorsOriginAllowed('https://extra.example.com', allowed)).toBe(true);
    expect(isCorsOriginAllowed('https://evil.example.com', allowed)).toBe(false);
    expect(isCorsOriginAllowed('https://hair.odivon.com.evil.com', allowed)).toBe(false);
    expect(isCorsOriginAllowed('http://localhost.evil.com', allowed)).toBe(false);
  });

  it('lets requests without an Origin header through', () => {
    expect(isCorsOriginAllowed(undefined, allowed)).toBe(true);
  });
});
