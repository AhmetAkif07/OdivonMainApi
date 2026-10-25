import { ProductModule } from '../authorization/constants';

/** Link a user clicks to verify their e-mail; each product app has its own verify page. */
export function verificationUrl(module: ProductModule, token: string): string {
  if (module === 'drivingschool') {
    const url =
      process.env.APP_URL_DRIVINGSCHOOL?.trim() ||
      (process.env.NODE_ENV === 'development'
        ? 'http://localhost:4200'
        : 'https://drivingschool.odivon.com');
    return `${url.replace(/\/+$/, '')}/auth/verify-email?token=${encodeURIComponent(token)}`;
  }
  if (module === 'rentacar') {
    const url =
      process.env.APP_URL_RENTACAR?.trim() ||
      (process.env.NODE_ENV === 'development'
        ? 'http://localhost:4200'
        : 'https://rent.odivon.com');
    return `${url.replace(/\/+$/, '')}/auth/verify-email?token=${encodeURIComponent(token)}`;
  }
  if (module === 'gym') {
    const url =
      process.env.APP_URL_GYM?.trim() || process.env.APP_URL?.trim() || 'https://gym.odivon.com';
    return `${url.replace(/\/+$/, '')}/auth/verify-email?token=${encodeURIComponent(token)}`;
  }
  if (module === 'spa') {
    const url = process.env.APP_URL_SPA?.trim() || 'https://spa.odivon.com';
    return `${url.replace(/\/+$/, '')}/auth/verify-email?token=${encodeURIComponent(token)}`;
  }
  if (module === 'vet') {
    const url = process.env.APP_URL_VET?.trim() || 'https://vet.odivon.com';
    return `${url.replace(/\/+$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
  }
  const apiUrl = process.env.PUBLIC_API_URL?.trim() || 'https://mainapi.odivon.com';
  return `${apiUrl.replace(/\/+$/, '')}/api/v1/identity/verification?token=${encodeURIComponent(token)}`;
}
