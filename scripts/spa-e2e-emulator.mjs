// End-to-end check of /api/v1/spa against the Firebase emulators: `npm run test:spa-e2e`.
// emulators:exec provides FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const PORT = 3055;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;

const server = spawn(process.execPath, ['dist/main.js'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(PORT),
    FIREBASE_PROJECT_ID: 'demo-odivon',
  },
  stdio: ['ignore', 'ignore', 'inherit'],
});

let passed = 0;
const step = (name) => { passed++; console.log(`  ✓ ${name}`); };

async function call(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data, error: json.error };
}
async function ok(method, path, token, body) {
  const r = await call(method, path, token, body);
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.error)}`);
  return r.data;
}
async function signIn(email, password) {
  const res = await fetch(`${AUTH}/accounts:signInWithPassword?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const json = await res.json();
  if (!json.idToken) throw new Error(JSON.stringify(json));
  return json.idToken;
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).status) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}

try {
  await waitForServer();
  const owner = { email: 'owner@spa.test', password: 'Sifre1234!' };
  await ok('POST', '/identity/register', null, { ...owner, tenantName: 'Test Spa', displayName: 'Ayşe Sahip', module: 'spa' });
  const t = await signIn(owner.email, owner.password);

  const me = await ok('GET', '/spa/me', t);
  assert.equal(me.role, 'admin'); assert.equal(me.isOwner, true); assert.equal(me.staff.role, 'admin');
  step('register + /spa/me seeds owner staff card, roles, settings');

  await ok('PATCH', '/spa/settings', t, { workDayStart: '00:00', workDayEnd: '24:00', name: 'Test Spa 2' });
  assert.equal((await ok('GET', '/spa/settings', t)).name, 'Test Spa 2');
  step('settings update');

  const room = await ok('POST', '/spa/rooms', t, { ad: 'Oda 1', kapasite: 1 });
  const service = await ok('POST', '/spa/services', t, { ad: 'Masaj', tur: 'masaj', sureDk: 60, fiyat: 800 });
  const product = await ok('POST', '/spa/products', t, { sku: 'K1', ad: 'Krem', fiyat: 120, kritikStokSeviyesi: 1, mevcutStok: 5 });
  const customer = await ok('POST', '/spa/customers', t, { ad: 'Müşteri', telefon: '555', cinsiyet: 'kadin', kvkkOnay: true });
  assert.equal((await ok('GET', '/spa/rooms', t)).length, 1);
  step('catalog + customer create/list');

  const moved = await ok('POST', '/spa/stock-movements', t, { productId: product.id, type: 'giris', qty: 3 });
  assert.equal(moved.mevcutStok, 8);
  assert.equal((await call('POST', '/spa/stock-movements', t, { productId: product.id, type: 'fire', qty: -99 })).status, 400);
  step('stock movement + negative stock guard');

  const tomorrow = new Date(Date.now() + 24 * 3600e3);
  const start = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 7, 0)).toISOString();
  const appt = await ok('POST', '/spa/appointments', t, { customerId: customer.id, staffId: me.uid, roomId: room.id, serviceId: service.id, start });
  assert.equal(appt.status, 'Bekliyor');
  const clash = await call('POST', '/spa/appointments', t, { customerId: customer.id, staffId: me.uid, roomId: room.id, serviceId: service.id, start });
  assert.equal(clash.status, 409); assert.match(clash.error.message, /Terapistin bu saatte/);
  const dayStart = start.slice(0, 10) + 'T00:00:00.000Z';
  const list = await ok('GET', `/spa/appointments?from=${dayStart}&to=${start.slice(0, 10)}T23:59:59.999Z`, t);
  assert.equal(list.length, 1);
  await ok('PATCH', `/spa/appointments/${appt.id}/status`, t, { status: 'Onaylandı' });
  step('appointment create, overlap rejection, range list, status change');

  const plan = await ok('POST', '/spa/package-plans', t, { ad: '5 Masaj', serviceId: service.id, seansAdedi: 5, fiyat: 3500, gecerlilikGunu: 90 });
  const bad = await call('POST', '/spa/customer-packages/sell', t, { customerId: customer.id, packagePlanId: plan.id, payments: [{ method: 'nakit', amount: 100 }] });
  assert.equal(bad.status, 409);
  const sold = await ok('POST', '/spa/customer-packages/sell', t, { customerId: customer.id, packagePlanId: plan.id, payments: [{ method: 'kart', amount: 3500 }] });
  step('package sell (with payment total check)');

  await ok('POST', '/spa/commissions/rules', t, { scope: 'service', refId: service.id, type: 'percent', value: 10, priority: 1 });
  const checkout = await ok('POST', '/spa/sessions/checkout', t, {
    appointmentId: appt.id, customerId: customer.id, staffId: me.uid, roomId: room.id,
    items: [
      { kind: 'service', refId: service.id, qty: 1, customerPackageId: sold.customerPackageId },
      { kind: 'product', refId: product.id, qty: 2 },
    ],
    payments: [{ method: 'nakit', amount: 240 }],
  });
  assert.equal(checkout.totalAmount, 240); assert.match(checkout.receiptNo, /^S-\d{8}-0001$/);
  const pkgs = await ok('GET', `/spa/customer-packages?customerId=${customer.id}`, t);
  assert.equal(pkgs[0].kalanSeans, 4);
  assert.equal((await ok('GET', `/spa/appointments/${appt.id}`, t)).status, 'Tamamlandı');
  const products = await ok('GET', '/spa/products', t);
  assert.equal(products[0].mevcutStok, 6);
  const accruals = await ok('GET', '/spa/commissions/accruals?status=pending', t);
  assert.equal(accruals.length, 1); assert.equal(accruals[0].amount, 80);
  step('POS checkout: package redeem, stock, receipt no, appointment completed, commission accrual');

  const pay = await ok('POST', '/spa/payments', t, { method: 'havale', amount: 50, customerId: customer.id });
  const refund = await ok('POST', `/spa/payments/${pay.id}/refund`, t, { reason: 'test' });
  assert.ok(refund.refundId);
  assert.equal((await call('POST', `/spa/payments/${pay.id}/refund`, t, {})).status, 409);
  step('manual payment + refund + double-refund guard');

  const payout = await ok('POST', '/spa/commissions/payout', t, { staffId: me.uid, accrualIds: [accruals[0].id] });
  assert.equal(payout.totalAmount, 80);
  step('commission payout creates prim expense');

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
  const closed = await ok('POST', `/spa/cash-register-days/${today}/close`, t);
  // kart 3500 + nakit 240 + havale 50 - 50 = 3740; expense 80
  assert.equal(closed.totalIncome, 3740); assert.equal(closed.totalExpense, 80); assert.equal(closed.netCash, 3660);
  assert.equal((await call('POST', '/spa/payments', t, { method: 'nakit', amount: 10 })).status, 409);
  await ok('POST', `/spa/cash-register-days/${today}/reopen`, t, { reason: 'düzeltme' });
  assert.equal((await ok('GET', `/spa/cash-register-days?from=${today}&to=${today}`, t))[0].status, 'open');
  await ok('POST', '/spa/payments', t, { method: 'nakit', amount: 10 });
  step('cash day close totals, closed-day lock, reopen');

  const invite = await ok('POST', '/spa/staff/invite', t, { email: 'terapist@spa.test', ad: 'Terapist', role: 'therapist' });
  const oobCode = new URL(invite.resetLink).searchParams.get('oobCode');
  await fetch(`${AUTH}/accounts:resetPassword?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ oobCode, newPassword: 'Terapist123!' }),
  });
  const tt = await signIn('terapist@spa.test', 'Terapist123!');
  const tme = await ok('GET', '/spa/me', tt);
  assert.equal(tme.role, 'therapist');
  assert.equal((await call('GET', '/spa/expenses', tt)).status, 403);
  assert.equal((await ok('GET', '/spa/customers', tt)).length, 1);
  assert.equal((await call('POST', '/spa/customers', tt, { ad: 'x', telefon: '1', cinsiyet: 'kadin', kvkkOnay: true })).status, 403);
  const leave = await ok('POST', '/spa/leaves', tt, { staffId: tme.uid, type: 'yillik', status: 'onaylandi', startDate: start, endDate: start });
  assert.equal(leave.status, 'beklemede');
  assert.equal((await call('POST', '/spa/leaves', tt, { staffId: me.uid, type: 'yillik', startDate: start, endDate: start })).status, 403);
  assert.equal((await ok('GET', '/spa/commissions/accruals/mine', tt)).length, 0);
  step('therapist invite, role permissions, own-leave rule');

  await ok('PATCH', `/spa/staff/${invite.staffId}/role`, t, { role: 'reception' });
  assert.equal((await ok('GET', '/spa/me', tt)).role, 'reception');
  assert.equal((await call('PATCH', `/spa/staff/${me.uid}/role`, t, { role: 'therapist' })).status, 403);
  await ok('POST', `/spa/staff/${invite.staffId}/deactivate`, t);
  assert.ok([401, 403].includes((await call('GET', '/spa/me', tt)).status));
  step('role change, owner protected, deactivate');

  const logs = await ok('GET', '/spa/audit-logs', t);
  assert.ok(logs.length > 10); assert.ok(logs.some((l) => l.entity === 'sessions'));
  step('audit log');

  // Google/e-mail sign-up without a profile → onboarding.
  const signUp = await (await fetch(`${AUTH}/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'yeni@spa.test', password: 'Yeni12345!', returnSecureToken: true }),
  })).json();
  const nt = signUp.idToken;
  assert.equal((await call('GET', '/spa/me', nt)).error.code, 'USER_NOT_FOUND');
  await ok('POST', '/spa/onboarding', nt, { businessName: 'Yeni Spa', ownerName: 'Yeni Sahip' });
  assert.equal((await ok('GET', '/spa/me', nt)).role, 'admin');
  assert.equal((await ok('GET', '/spa/customers', nt)).length, 0);
  assert.equal((await call('POST', '/spa/onboarding', nt, { businessName: 'x', ownerName: 'y' })).status, 409);
  step('onboarding for a profile-less Firebase user; tenant isolation');

  console.log(`\nSPA e2e: ${passed} steps passed`);
} catch (err) {
  console.error('SPA e2e FAILED:', err);
  process.exitCode = 1;
} finally {
  server.kill();
}
