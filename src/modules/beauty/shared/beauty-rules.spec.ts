import { commissionAmount, conflictReason, nextSessionDue, refundableAmount } from './beauty-rules';
import { BEAUTY_RESOURCES } from './beauty-store';

describe('beauty business rules', () => {
  it('detects staff, room, device and customer conflicts', () => {
    const base = { startAt: '2026-10-15T10:00:00Z', endAt: '2026-10-15T11:00:00Z', status: 'confirmed' };
    expect(conflictReason({ ...base, staffId: 'stf-1' }, [{ ...base, staffId: 'stf-1' }])).toContain('Uzman');
    expect(conflictReason({ ...base, roomId: 'room-1' }, [{ ...base, roomId: 'room-1' }])).toContain('Oda');
    expect(conflictReason({ ...base, deviceId: 'dev-1' }, [{ ...base, deviceId: 'dev-1' }])).toContain('Cihaz');
    expect(conflictReason({ ...base, customerId: 'cus-1' }, [{ ...base, customerId: 'cus-1' }])).toContain('Musteri');
  });
  it('calculates package due date, commission and pro-rata refund', () => {
    expect(nextSessionDue('2026-10-01T12:00:00.000Z', 28)).toBe('2026-10-29T12:00:00.000Z');
    expect(commissionAmount(1_000, 12.5)).toBe(125);
    expect(refundableAmount(8_000, 8, 3)).toBe(5_000);
  });
  it('defines consultations, service-packages, health, wallet and installment resources', () => {
    expect(BEAUTY_RESOURCES['consultations']).toBeDefined();
    expect(BEAUTY_RESOURCES['consultations'].collection).toBe('beautyConsultations');
    expect(BEAUTY_RESOURCES['consultations'].permission).toBe('beautyCustomers');
    expect(BEAUTY_RESOURCES['consultations'].branchRequired).toBe(true);

    expect(BEAUTY_RESOURCES['service-packages']).toBeDefined();
    expect(BEAUTY_RESOURCES['service-packages'].collection).toBe('beautyServicePackages');

    expect(BEAUTY_RESOURCES['customer-health']).toBeDefined();
    expect(BEAUTY_RESOURCES['customer-health'].collection).toBe('beautyCustomerHealth');

    expect(BEAUTY_RESOURCES['wallet-transactions']).toBeDefined();
    expect(BEAUTY_RESOURCES['wallet-transactions'].collection).toBe('beautyWalletTransactions');

    expect(BEAUTY_RESOURCES['installments']).toBeDefined();
    expect(BEAUTY_RESOURCES['installments'].collection).toBe('beautyInstallmentPlans');

    expect(BEAUTY_RESOURCES['nail-warranties']).toBeDefined();
    expect(BEAUTY_RESOURCES['nail-warranties'].collection).toBe('beautyNailWarranties');

    expect(BEAUTY_RESOURCES['nail-sterilizations']).toBeDefined();
    expect(BEAUTY_RESOURCES['nail-sterilizations'].collection).toBe('beautyNailSterilizations');
  });
});