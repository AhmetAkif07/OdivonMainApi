/**
 * Normalises a phone number to E.164. Turkish local forms (`0532…`, `532…`, `90532…`) get `+90`;
 * other numbers must already carry a `+country` prefix. Returns null when it cannot be a phone number.
 */
export function normalizePhone(input: string | undefined | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  let e164: string;
  if (trimmed.startsWith('+')) e164 = `+${digits}`;
  else if (trimmed.startsWith('00')) e164 = `+${digits.slice(2)}`;
  else if (digits.length === 11 && digits.startsWith('0')) e164 = `+90${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith('5')) e164 = `+90${digits}`;
  else if (digits.length === 12 && digits.startsWith('90')) e164 = `+${digits}`;
  else return null;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/** `+905321234567` → `+90 5** *** **67` (public booking responses never show the full number). */
export function maskPhone(phone: string): string {
  if (phone.length < 6) return '***';
  const rest = phone.slice(3);
  return `${phone.slice(0, 3)} ${rest.slice(0, 1)}** *** **${rest.slice(-2)}`;
}
