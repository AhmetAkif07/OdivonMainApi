import { isWithinCheckInWindow } from './check-in-window';

describe('isWithinCheckInWindow', () => {
  it('allows when window is missing', () => {
    expect(isWithinCheckInWindow(null, null, new Date('2026-09-26T12:00:00'))).toBe(true);
  });

  it('allows a time inside the window', () => {
    expect(isWithinCheckInWindow('06:00', '23:00', new Date(2026, 8, 26, 12, 0))).toBe(true);
  });

  it('denies a time outside the window', () => {
    expect(isWithinCheckInWindow('08:00', '10:00', new Date(2026, 8, 26, 12, 0))).toBe(false);
  });
});
