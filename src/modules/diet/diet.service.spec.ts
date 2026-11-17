import { FakeFirestore } from '../../shared/testing/fake-firestore';
import { TenantContext, TenantStore } from '../../shared/tenancy/tenant.context';
import { DietRepository } from './diet.repository';
import { DietService, goalProgressPct, istanbulDay } from './diet.service';

const owner = (tenantId: string): TenantStore => ({
  tenantId,
  userId: `${tenantId}-owner`,
  role: 'owner',
  modules: ['diet'],
  email: `${tenantId}@example.test`,
  displayName: 'Dyt. Deniz Arslan',
});

const reception = (tenantId: string): TenantStore => ({
  tenantId,
  userId: `${tenantId}-desk`,
  role: 'user',
  modules: ['diet'],
  email: `desk@${tenantId}.test`,
  permissions: { dietClients: ['view', 'create', 'update'], dietSchedule: ['view', 'create', 'update'] },
});

function setup() {
  const db = new FakeFirestore();
  const tenant = new TenantContext();
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const identity = {
    listByCurrentTenant: jest.fn().mockResolvedValue([
      { uid: 'clinic-a-owner', displayName: 'Dyt. Deniz Arslan', email: 'd@x', role: 'owner', status: 'active' },
    ]),
  };
  const repo = new DietRepository({ db } as never, tenant, audit as never);
  const service = new DietService(repo, tenant, identity as never);
  return { db, tenant, audit, service };
}

const newClient = {
  firstName: 'Elif',
  lastName: 'Kaya',
  email: 'Elif@Ornek.com',
  sex: 'female' as const,
  heightCm: 165,
  startWeightKg: 82,
  targetWeightKg: 68,
  conditions: ['İnsülin direnci'],
  clinicalNotes: 'Metformin kullanıyor',
};

describe('diet helpers', () => {
  it('computes goal progress and Turkey calendar days', () => {
    expect(goalProgressPct({ startWeightKg: 82, targetWeightKg: 68, currentWeightKg: 75 })).toBe(50);
    expect(goalProgressPct({ startWeightKg: 60, targetWeightKg: 66, currentWeightKg: 69 })).toBe(100);
    expect(goalProgressPct({ startWeightKg: 70, targetWeightKg: 70, currentWeightKg: 70 })).toBeNull();
    expect(istanbulDay('2026-11-14T22:30:00Z')).toBe('2026-11-15');
  });
});

describe('DietService', () => {
  it('keeps client weight in sync with measurements and isolates tenants', async () => {
    const { tenant, service } = setup();
    let clientId = '';
    await tenant.run(owner('clinic-a'), async () => {
      const client = await service.createClient(newClient);
      clientId = client.id;
      expect(client).toMatchObject({ email: 'elif@ornek.com', currentWeightKg: 82, goalProgressPct: 0, status: 'active' });

      await service.addMeasurement(clientId, { date: '2026-11-01T09:00:00Z', weightKg: 78, waistCm: 90 });
      const latest = await service.addMeasurement(clientId, { date: '2026-11-10T09:00:00Z', weightKg: 75 });
      expect(await service.getClient(clientId)).toMatchObject({ currentWeightKg: 75, goalProgressPct: 50, waistCm: 90 });

      await service.deleteMeasurement(latest.id);
      expect(await service.getClient(clientId)).toMatchObject({ currentWeightKg: 78, lastMeasuredAt: '2026-11-01T09:00:00Z' });
      expect(await service.listMeasurements(clientId)).toHaveLength(1);
    });
    await tenant.run(owner('clinic-b'), async () => {
      expect(await service.listClients({})).toHaveLength(0);
      await expect(service.getClient(clientId)).rejects.toMatchObject({ code: 'DIET_RECORD_NOT_FOUND' });
    });
  });

  it('hides clinical data from reception and blocks clinical writes', async () => {
    const { tenant, service } = setup();
    let clientId = '';
    await tenant.run(owner('clinic-a'), async () => {
      clientId = (await service.createClient(newClient)).id;
      await service.createConsultation({ clientId, at: '2026-11-20T10:00:00Z', channel: 'clinic', notes: 'Gizli not' });
    });
    await tenant.run(reception('clinic-a'), async () => {
      const client = await service.getClient(clientId);
      expect(client).not.toHaveProperty('conditions');
      expect(client).not.toHaveProperty('clinicalNotes');
      expect(client).toMatchObject({ firstName: 'Elif', phone: '' });
      const [consultation] = await service.listConsultations({ clientId });
      expect(consultation).not.toHaveProperty('notes');
      expect(consultation).toMatchObject({ clientName: 'Elif Kaya' });
      await expect(service.updateClient(clientId, { allergies: ['Fıstık'] })).rejects.toMatchObject({
        code: 'FORBIDDEN_PERMISSION',
      });
      await expect(service.updateClient(clientId, { phone: '0555 000 00 00' })).resolves.toMatchObject({
        phone: '0555 000 00 00',
      });
    });
  });

  it('keeps one active plan per client and validates macros', async () => {
    const { tenant, service } = setup();
    await tenant.run(owner('clinic-a'), async () => {
      const { id: clientId } = await service.createClient(newClient);
      const base = { clientId, startDate: '2026-11-01', endDate: '2026-11-30', kcal: 1650, proteinPct: 25, carbPct: 45, fatPct: 30 };
      const first = await service.createPlan({ ...base, title: 'Kasım', status: 'active', meals: [{ name: 'Kahvaltı', time: '08:00', kcal: 413 }] });
      const second = await service.createPlan({ ...base, title: 'Aralık', status: 'draft' });
      await service.updatePlan(second.id, { status: 'active' });
      expect(await service.getPlan(first.id)).toMatchObject({ status: 'completed' });
      expect((await service.clientOverview(clientId)).activePlan).toMatchObject({ id: second.id });
      await expect(service.createPlan({ ...base, title: 'Hatalı', fatPct: 50 })).rejects.toMatchObject({
        code: 'DIET_RECORD_INVALID',
      });
    });
  });

  it('tracks conversations, tasks and request updates', async () => {
    const { tenant, service } = setup();
    await tenant.run(owner('clinic-a'), async () => {
      const { id: clientId } = await service.createClient(newClient);
      await service.sendMessage(clientId, { body: 'Merhaba Elif Hanım' });
      const task = await service.createTask(clientId, { title: 'Öğle yemeği fotoğrafı', category: 'photo' });
      const request = await service.createRequest({ clientId, type: 'appointment', subject: 'Randevu' });
      await service.updateRequest(request.id, { status: 'resolved', response: 'Salı 10:00' });

      const messages = await service.listMessages(clientId, {});
      expect(messages.map((m) => m.author)).toEqual(['dietitian', 'system', 'system']);
      expect(messages[0]).toMatchObject({ authorName: 'Dyt. Deniz Arslan' });
      expect(messages[1]).toMatchObject({ taskId: task.id });
      expect(messages[2]!.body).toContain('Çözüldü');

      const [conversation] = await service.listConversations();
      expect(conversation).toMatchObject({ clientName: 'Elif Kaya', unreadForMember: 3, unreadForStaff: 0 });
      await expect(service.sendMessage(clientId, { body: '  ' })).rejects.toMatchObject({ code: 'DIET_RECORD_INVALID' });

      const done = await service.updateTask(task.id, { status: 'done' });
      expect(done.completedAt).not.toBeNull();
      expect(await service.listTasks({ status: 'open' })).toHaveLength(0);
    });
  });

  it('builds the daily dashboard and the manager summary', async () => {
    const { tenant, service } = setup();
    await tenant.run(owner('clinic-a'), async () => {
      const { id: clientId } = await service.createClient(newClient);
      const later = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const sameDay = istanbulDay(later) === istanbulDay(new Date());
      await service.createConsultation({ clientId, at: later, channel: 'video' });
      await service.createRequest({ clientId, type: 'question', subject: 'Su tüketimi' });

      const dashboard = await service.dashboard();
      expect(dashboard).toMatchObject({ activeClients: 1, newClientsThisMonth: 1, openRequests: 1, avgGoalProgressPct: 0 });
      expect(dashboard.attentionClients).toEqual([
        expect.objectContaining({ id: clientId, reason: 'no_recent_measurement' }),
      ]);
      if (sameDay) expect(dashboard.nextConsultation).toMatchObject({ clientName: 'Elif Kaya', channel: 'video' });

      const summary = await service.adminSummary();
      expect(summary.clientsByStatus).toEqual({ active: 1, paused: 0, archived: 0 });
      expect(summary.staff).toEqual([expect.objectContaining({ uid: 'clinic-a-owner', activeClients: 1 })]);
      expect(summary.newClientsByMonth).toHaveLength(6);
    });
  });

  it('stores push tokens and notification preferences per user', async () => {
    const { tenant, service } = setup();
    await tenant.run(owner('clinic-a'), async () => {
      const token = 'ExponentPushToken[abcdefghijklmnop]';
      const first = await service.registerDevice({ token, platform: 'ios' });
      const again = await service.registerDevice({ token, platform: 'ios', appVersion: '1.0.1' });
      expect(again.id).toBe(first.id);
      expect(await service.notificationPrefs()).toMatchObject({ messages: true, quietHoursStart: null });
      expect(await service.updateNotificationPrefs({ messages: false, quietHoursStart: '22:00' })).toMatchObject({
        messages: false,
        requests: true,
        quietHoursStart: '22:00',
      });
      expect(await service.unregisterDevice(token)).toMatchObject({ deleted: true });
    });
  });
});
