import { mkdir, writeFile } from 'node:fs/promises';

const admin = [
  ['GET', 'Branches', '/apm/branches'], ['POST', 'Create branch', '/apm/branches'],
  ['GET', 'Services', '/apm/services'], ['POST', 'Create service', '/apm/services'],
  ['GET', 'Staff', '/apm/staff'], ['POST', 'Create staff', '/apm/staff'],
  ['GET', 'Working hours', '/apm/working-hours'], ['POST', 'Create working hours', '/apm/working-hours'],
  ['GET', 'Time off', '/apm/time-off'], ['POST', 'Create time off', '/apm/time-off'],
  ['GET', 'Availability', '/apm/availability?branchId={{branchId}}&serviceId={{serviceId}}&date={{date}}'],
  ['GET', 'Appointments', '/apm/appointments'], ['POST', 'Create appointment', '/apm/appointments'],
  ['PATCH', 'Appointment status', '/apm/appointments/{{appointmentId}}/status'],
  ['POST', 'Register admin device', '/apm/devices'], ['DELETE', 'Remove admin device', '/apm/devices?token={{deviceToken}}'],
];

const publicBooking = [
  ['GET', 'Booking info', '/apm/public/booking/{{slug}}/info'],
  ['GET', 'Booking services', '/apm/public/booking/{{slug}}/services'],
  ['GET', 'Booking staff', '/apm/public/booking/{{slug}}/staff?serviceId={{serviceId}}'],
  ['GET', 'Booking slots', '/apm/public/booking/{{slug}}/slots?serviceId={{serviceId}}&date={{date}}'],
  ['POST', 'Send OTP', '/apm/public/booking/{{slug}}/otp'],
  ['POST', 'Create guest appointment', '/apm/public/booking/{{slug}}/appointments'],
  ['GET', 'Guest appointment status', '/apm/public/booking/{{slug}}/appointments/{{appointmentId}}?token={{bookingToken}}'],
  ['PATCH', 'Cancel guest appointment', '/apm/public/booking/{{slug}}/appointments/{{appointmentId}}/cancel?token={{bookingToken}}'],
  ['POST', 'Register guest device', '/apm/public/booking/{{slug}}/appointments/{{appointmentId}}/device?token={{bookingToken}}'],
  ['DELETE', 'Remove guest device', '/apm/public/booking/{{slug}}/appointments/{{appointmentId}}/device?token={{bookingToken}}&deviceToken={{deviceToken}}'],
];

const body = (name) => {
  if (name === 'Send OTP') return { email: '{{guestEmail}}' };
  if (name === 'Appointment status') return { status: 'Confirmed' };
  if (name.includes('device')) return { deviceToken: '{{deviceToken}}', platform: 'android' };
  return {};
};

const item = ([method, name, path], authenticated) => ({
  name,
  request: {
    method,
    header: [
      ...(authenticated ? [{ key: 'Authorization', value: 'Bearer {{firebaseIdToken}}', type: 'text' }] : []),
      ...(!authenticated ? [{ key: 'X-Firebase-AppCheck', value: '{{firebaseAppCheckToken}}', type: 'text' }] : []),
      ...(['POST', 'PATCH'].includes(method) ? [{ key: 'Content-Type', value: 'application/json', type: 'text' }] : []),
    ],
    ...(method === 'POST' || method === 'PATCH' ? { body: { mode: 'raw', raw: JSON.stringify(body(name), null, 2), options: { raw: { language: 'json' } } } } : {}),
    url: `{{baseUrl}}${path}`,
  },
});

const collection = {
  info: {
    _postman_id: '5fb305fd-a03f-44f2-9aec-727c630c5548',
    name: 'Odivon APM API',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    ['baseUrl', 'http://localhost:3000/api/v1'], ['firebaseIdToken', ''], ['firebaseAppCheckToken', ''],
    ['slug', 'merkez'], ['branchId', ''], ['serviceId', ''], ['appointmentId', ''], ['bookingToken', ''],
    ['deviceToken', ''], ['guestEmail', 'guest@example.com'], ['date', '2026-10-20'],
  ].map(([key, value]) => ({ key, value, type: 'string' })),
  item: [
    { name: 'Admin', item: admin.map((entry) => item(entry, true)) },
    { name: 'Public booking', item: publicBooking.map((entry) => item(entry, false)) },
  ],
};

await mkdir(new URL('../postman/', import.meta.url), { recursive: true });
await writeFile(new URL('../postman/Odivon-APM.postman_collection.json', import.meta.url), `${JSON.stringify(collection, null, 2)}\n`);
