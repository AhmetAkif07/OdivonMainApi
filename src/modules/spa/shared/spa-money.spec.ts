import assert from 'node:assert/strict';
import { AppException } from '../../../shared/errors/app.exception';
import { assertPayments, isDateId, isMoney, isPositiveInt, MAX_LINE_QTY } from './spa-money';

test('isPositiveInt accepts whole quantities within the cap only', () => {
  assert.equal(isPositiveInt(1, MAX_LINE_QTY), true);
  assert.equal(isPositiveInt(MAX_LINE_QTY, MAX_LINE_QTY), true);
  for (const bad of [0, -1, 1.5, NaN, Infinity, '2', null, undefined, MAX_LINE_QTY + 1]) {
    assert.equal(isPositiveInt(bad, MAX_LINE_QTY), false, String(bad));
  }
});

test('isMoney accepts non-negative amounts with at most two decimals', () => {
  for (const ok of [0, 1, 10.5, 99.99, 0.1 + 0.2]) assert.equal(isMoney(ok), true, String(ok));
  for (const bad of [-0.01, -5, 1.005, NaN, Infinity, '10', null])
    assert.equal(isMoney(bad), false, String(bad));
});

test('assertPayments rejects zero, negative and unknown-method rows', () => {
  assert.deepEqual(assertPayments([{ method: 'nakit', amount: 100 }]), [
    { method: 'nakit', amount: 100 },
  ]);
  assert.deepEqual(assertPayments([], { allowEmpty: true }), []);
  const rejects = (input: unknown) =>
    assert.throws(
      () => assertPayments(input),
      (e) => e instanceof AppException && e.code === 'SPA_INVALID',
    );
  rejects([]);
  rejects(undefined);
  rejects([{ method: 'nakit', amount: 0 }]);
  rejects([
    { method: 'nakit', amount: 1500 },
    { method: 'kart', amount: -500 },
  ]);
  rejects([{ method: 'bitcoin', amount: 10 }]);
});

test('isDateId only accepts real YYYY-MM-DD dates', () => {
  assert.equal(isDateId('2026-09-27'), true);
  assert.equal(isDateId('2024-02-29'), true);
  for (const bad of ['2026-02-30', '2026-13-01', '26-09-27', '2026-9-27', '../x', undefined]) {
    assert.equal(isDateId(bad), false, String(bad));
  }
});
