import { ErrorCode } from '../../../shared/errors/error-codes';
import { TenantContext, TenantStore } from '../../../shared/tenancy/tenant.context';
import { AccessAgentsService } from './access-agents.service';
import {
  computeDesiredState,
  istanbulYmd,
  membershipValidEnd,
  parseAgentAuthorization,
  sha256Hex,
} from './access-rules';
import { AccessSyncService } from './access-sync.service';
import { AccessRepository } from './access.repository';
import { AgentAuthGuard } from './agent-auth.guard';
import { AgentPrincipal } from './agent-principal';

// ─── In-memory Firestore with the subset of the Admin SDK used by the access module ──────

type Data = Record<string, unknown>;
type Filter = { field: string; op: '==' | 'in' | '<'; value: unknown };

function firestoreError(code: number, message: string) {
  return Object.assign(new Error(message), { code });
}

class FakeFirestore {
  readonly docs = new Map<string, Data>();
  private lock: Promise<unknown> = Promise.resolve();
  private seq = 0;

  collection(path: string) {
    return new FakeQuery(this, path, [], undefined);
  }

  doc(path: string) {
    return new FakeDocRef(this, path);
  }

  nextId() {
    this.seq += 1;
    return `auto${this.seq}`;
  }

  async getAll(...refs: FakeDocRef[]) {
    return refs.map((ref) => ref.snapshot());
  }

  batch() {
    const ops: (() => void)[] = [];
    const batch = {
      update: (ref: FakeDocRef, data: Data) => {
        ops.push(() => ref.applyUpdate(data));
        return batch;
      },
      set: (ref: FakeDocRef, data: Data) => {
        ops.push(() => this.docs.set(ref.path, { ...data }));
        return batch;
      },
      commit: async () => {
        ops.forEach((op) => op());
      },
    };
    return batch;
  }

  /** Serialised like Firestore's conflicting transactions; writes apply at commit. */
  runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const run = this.lock.then(async () => {
      const writes: (() => void)[] = [];
      const tx = {
        get: async (target: FakeDocRef | FakeQuery) =>
          target instanceof FakeDocRef ? target.snapshot() : target.snapshotQuery(),
        getAll: async (...refs: FakeDocRef[]) => refs.map((ref) => ref.snapshot()),
        set: (ref: FakeDocRef, data: Data) => writes.push(() => this.docs.set(ref.path, { ...data })),
        update: (ref: FakeDocRef, data: Data) => writes.push(() => ref.applyUpdate(data)),
        create: (ref: FakeDocRef, data: Data) => writes.push(() => this.docs.set(ref.path, { ...data })),
      };
      const result = await fn(tx);
      writes.forEach((write) => write());
      return result;
    });
    this.lock = run.catch(() => undefined);
    return run;
  }
}

class FakeDocRef {
  constructor(
    private readonly db: FakeFirestore,
    readonly path: string,
  ) {}

  get id() {
    return this.path.split('/').at(-1)!;
  }

  get ref() {
    return this;
  }

  snapshot() {
    const data = this.db.docs.get(this.path);
    return { id: this.id, ref: this, exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
  }

  async get() {
    return this.snapshot();
  }

  async set(data: Data) {
    this.db.docs.set(this.path, { ...data });
  }

  async create(data: Data) {
    if (this.db.docs.has(this.path)) throw firestoreError(6, '6 ALREADY_EXISTS: Document already exists');
    this.db.docs.set(this.path, { ...data });
  }

  async update(data: Data) {
    this.applyUpdate(data);
  }

  applyUpdate(data: Data) {
    const current = this.db.docs.get(this.path);
    if (!current) throw firestoreError(5, '5 NOT_FOUND');
    this.db.docs.set(this.path, { ...current, ...data });
  }
}

class FakeQuery {
  constructor(
    private readonly db: FakeFirestore,
    private readonly path: string,
    private readonly filters: Filter[],
    private readonly max: number | undefined,
  ) {}

  doc(id?: string) {
    return new FakeDocRef(this.db, `${this.path}/${id ?? this.db.nextId()}`);
  }

  where(field: string, op: Filter['op'], value: unknown) {
    return new FakeQuery(this.db, this.path, [...this.filters, { field, op, value }], this.max);
  }

  limit(max: number) {
    return new FakeQuery(this.db, this.path, this.filters, max);
  }

  snapshotQuery() {
    const prefix = `${this.path}/`;
    const docs = [...this.db.docs.keys()]
      .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
      .map((key) => new FakeDocRef(this.db, key).snapshot())
      .filter((snapshot) => this.filters.every((filter) => matches(snapshot.data()!, filter)))
      .slice(0, this.max ?? Infinity);
    return { docs, size: docs.length, empty: docs.length === 0 };
  }

  async get() {
    return this.snapshotQuery();
  }

  count() {
    return { get: async () => ({ data: () => ({ count: this.snapshotQuery().size }) }) };
  }
}

function matches(data: Data, filter: Filter) {
  const value = data[filter.field];
  if (filter.op === '==') return value === filter.value;
  if (filter.op === 'in') return (filter.value as unknown[]).includes(value);
  return value !== null && value !== undefined && String(value) < String(filter.value);
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const NOW = new Date('2026-09-28T12:00:00.000Z');

function setup() {
  const db = new FakeFirestore();
  const firebase = { db } as never;
  const context = new TenantContext();
  const repo = new AccessRepository(firebase);
  const agents = new AccessAgentsService(repo, context);
  const sync = new AccessSyncService(repo, context);
  const guard = new AgentAuthGuard(repo, context);
  return { db, context, repo, agents, sync, guard };
}

function admin(tenantId: string): TenantStore {
  return { tenantId, userId: `owner-${tenantId}`, role: 'owner', modules: ['gym'], email: '' };
}

function seedGate(db: FakeFirestore, tenantId: string, gateId: string, extra: Data = {}) {
  db.docs.set(`tenants/${tenantId}/gymTurnstileGates/${gateId}`, {
    id: gateId,
    name: `Gate ${gateId}`,
    direction: 'in',
    protocol: 'yt-http-digest',
    host: '192.168.1.201',
    deletedAt: null,
    ...extra,
  });
}

function seedMember(db: FakeFirestore, tenantId: string, uid: string, extra: Data = {}) {
  const member = {
    uid,
    id: uid,
    displayName: `Member ${uid}`,
    memberNumber: `N-${uid}`,
    rfidCardNumber: `C-${uid}`,
    membershipStatus: 'active',
    membershipEndsAt: '2026-10-31T09:00:00.000Z',
    isArchived: false,
    archivedAt: null,
    deletedAt: null,
    photoURL: null,
    ...extra,
  };
  db.docs.set(`tenants/${tenantId}/gymMembers/${uid}`, member);
  return member as never;
}

async function pairAndEnroll(env: ReturnType<typeof setup>, tenantId: string, gateIds: string[]) {
  const { code } = await env.context.run(admin(tenantId), () => env.agents.createPairingCode({ gateIds }, NOW));
  return env.agents.enroll({ code, name: 'Agent', hostname: 'pc', agentVersion: '2.0.0' }, NOW);
}

function principal(enrolled: { agentId: string; tenantId: string; gateIds: string[] }): AgentPrincipal {
  return { agentId: enrolled.agentId, tenantId: enrolled.tenantId, gateIds: enrolled.gateIds };
}

function httpContext(authorization?: string) {
  const request = {
    header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
  } as Record<string, unknown>;
  return { request, context: { switchToHttp: () => ({ getRequest: () => request }) } as never };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('validEnd (Europe/Istanbul, end of day)', () => {
  it('formats the Turkish calendar day of the membership end', () => {
    expect(istanbulYmd(new Date('2026-10-31T20:59:59Z'))).toBe('20261031');
    expect(istanbulYmd(new Date('2026-10-31T21:00:00Z'))).toBe('20261101');
    expect(membershipValidEnd('2026-10-31')).toBe('20261031');
    expect(membershipValidEnd('2026-10-31T00:30:00+03:00')).toBe('20261031');
    expect(membershipValidEnd(null)).toBeNull();
    expect(membershipValidEnd('not a date')).toBeNull();
  });

  it('keeps access until the end of the last day in Turkey', () => {
    const member = {
      memberNumber: '1042',
      displayName: 'Ayse',
      rfidCardNumber: null,
      membershipEndsAt: '2026-10-31T06:00:00Z',
      membershipStatus: 'active' as const,
      isArchived: false,
    };
    expect(computeDesiredState(member, new Date('2026-10-31T20:30:00Z')).enabled).toBe(true); // 23:30 TR
    expect(computeDesiredState(member, new Date('2026-10-31T21:30:00Z')).enabled).toBe(false); // 00:30 TR next day
  });

  it('disables cancelled, archived, deleted, number-less or open-ended memberships', () => {
    const base = {
      memberNumber: '1042',
      displayName: 'Ayse',
      rfidCardNumber: ' 0012 ',
      membershipEndsAt: '2026-12-31T00:00:00Z',
      membershipStatus: 'active' as const,
      isArchived: false,
    };
    expect(computeDesiredState(base, NOW)).toEqual({
      userId: '1042',
      name: 'Ayse',
      card: '0012',
      validEnd: '20261231',
      enabled: true,
    });
    expect(computeDesiredState({ ...base, membershipStatus: 'cancelled' }, NOW).enabled).toBe(false);
    expect(computeDesiredState({ ...base, isArchived: true }, NOW).enabled).toBe(false);
    expect(computeDesiredState({ ...base, deletedAt: NOW.toISOString() }, NOW).enabled).toBe(false);
    expect(computeDesiredState({ ...base, memberNumber: '' }, NOW).enabled).toBe(false);
    expect(computeDesiredState({ ...base, membershipEndsAt: null }, NOW).enabled).toBe(false);
  });
});

describe('agent enrollment', () => {
  it('stores only hashes and consumes the pairing code once', async () => {
    const env = setup();
    seedGate(env.db, 't1', 'g1');
    const { code, expiresAt } = await env.context.run(admin('t1'), () =>
      env.agents.createPairingCode({ gateIds: ['g1'] }, NOW),
    );
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(expiresAt).toBe('2026-09-28T12:10:00.000Z');
    const stored = env.db.docs.get(`gymAgentPairingCodes/${sha256Hex(code)}`);
    expect(stored).toMatchObject({ tenantId: 't1', gateIds: ['g1'], usedAt: null });
    expect(JSON.stringify([...env.db.docs.values()])).not.toContain(code);

    const enrolled = await env.agents.enroll({ code: code.toLowerCase(), name: 'Front desk PC' }, NOW);
    expect(enrolled).toMatchObject({ tenantId: 't1', gateIds: ['g1'] });
    expect(enrolled.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const index = env.db.docs.get(`gymAgentIndex/${enrolled.agentId}`);
    expect(index).toEqual({ tenantId: 't1', tokenHash: sha256Hex(enrolled.token), revokedAt: null, createdAt: NOW.toISOString() });
    expect(JSON.stringify([...env.db.docs.values()])).not.toContain(enrolled.token);
    expect(env.db.docs.get('tenants/t1/gymTurnstileGates/g1')?.['agentId']).toBe(enrolled.agentId);

    await expect(env.agents.enroll({ code, name: 'Second' }, NOW)).rejects.toMatchObject({
      code: ErrorCode.GYM_AGENT_PAIRING_INVALID,
    });
  });

  it('rejects an expired or unknown code', async () => {
    const env = setup();
    seedGate(env.db, 't1', 'g1');
    const { code } = await env.context.run(admin('t1'), () => env.agents.createPairingCode({ gateIds: ['g1'] }, NOW));
    const later = new Date(NOW.getTime() + 10 * 60_000);
    await expect(env.agents.enroll({ code, name: 'Late' }, later)).rejects.toMatchObject({
      code: ErrorCode.GYM_AGENT_PAIRING_INVALID,
    });
    await expect(env.agents.enroll({ code: 'ABCDEFGH', name: 'Guess' }, NOW)).rejects.toMatchObject({
      code: ErrorCode.GYM_AGENT_PAIRING_INVALID,
    });
  });

  it('refuses pairing codes for gates of another tenant', async () => {
    const env = setup();
    seedGate(env.db, 't2', 'g2');
    await expect(
      env.context.run(admin('t1'), () => env.agents.createPairingCode({ gateIds: ['g2'] }, NOW)),
    ).rejects.toMatchObject({ code: ErrorCode.GYM_GATE_NOT_FOUND });
  });
});

describe('AgentAuthGuard', () => {
  it('builds the tenant context from the agent index', async () => {
    const env = setup();
    seedGate(env.db, 't1', 'g1');
    const enrolled = await pairAndEnroll(env, 't1', ['g1']);
    const { request, context } = httpContext(`Agent ${enrolled.agentId}.${enrolled.token}`);
    await env.context.run({} as never, async () => {
      await expect(env.guard.canActivate(context)).resolves.toBe(true);
      expect(env.context.getTenantId()).toBe('t1');
    });
    expect(request['accessAgent']).toEqual({ agentId: enrolled.agentId, tenantId: 't1', gateIds: ['g1'] });
  });

  it('rejects wrong tokens, Firebase bearer tokens and revoked agents', async () => {
    const env = setup();
    seedGate(env.db, 't1', 'g1');
    const enrolled = await pairAndEnroll(env, 't1', ['g1']);
    const wrong = 'x'.repeat(43);
    for (const header of [
      `Agent ${enrolled.agentId}.${wrong}`,
      `Bearer ${enrolled.token}`,
      `Agent ${enrolled.token}`,
      undefined,
    ]) {
      await expect(env.guard.canActivate(httpContext(header).context)).rejects.toMatchObject({
        code: ErrorCode.GYM_AGENT_UNAUTHORIZED,
      });
    }
    await env.context.run(admin('t1'), () => env.agents.revokeAgent(enrolled.agentId, NOW));
    expect(env.db.docs.get('tenants/t1/gymTurnstileGates/g1')?.['agentId']).toBeNull();
    await expect(
      env.guard.canActivate(httpContext(`Agent ${enrolled.agentId}.${enrolled.token}`).context),
    ).rejects.toMatchObject({ code: ErrorCode.GYM_AGENT_UNAUTHORIZED });
  });

  it('parses only the Agent scheme', () => {
    expect(parseAgentAuthorization('Agent abc123.' + 'a'.repeat(43))).toEqual({ agentId: 'abc123', token: 'a'.repeat(43) });
    expect(parseAgentAuthorization('Agent abc123')).toBeNull();
    expect(parseAgentAuthorization('Agent ../x.' + 'a'.repeat(43))).toBeNull();
  });
});

describe('work delivery and acknowledgement', () => {
  async function scenario() {
    const env = setup();
    seedGate(env.db, 't1', 'g1');
    seedGate(env.db, 't1', 'g3');
    seedGate(env.db, 't2', 'g2');
    const members = ['m1', 'm2', 'm3'].map((uid) => seedMember(env.db, 't1', uid));
    const other = seedMember(env.db, 't2', 'x1');
    const a = await pairAndEnroll(env, 't1', ['g1']);
    const c = await pairAndEnroll(env, 't1', ['g3']);
    const b = await pairAndEnroll(env, 't2', ['g2']);
    for (const member of members) await env.sync.syncMember('t1', member, NOW);
    await env.sync.syncMember('t2', other, NOW);
    return { env, a: principal(a), b: principal(b), c: principal(c) };
  }

  it('leases each pending item to exactly one caller', async () => {
    const { env, a } = await scenario();
    const [first, second] = await Promise.all([env.agents.work(a, 50, NOW), env.agents.work(a, 50, NOW)]);
    const ids = [...first.items, ...second.items].map((item) => item.id).sort();
    expect(ids).toEqual(['g1_m1', 'g1_m2', 'g1_m3']);
    expect(first.devices).toEqual([
      expect.objectContaining({ gateId: 'g1', protocol: 'yt-http-digest', port: 80, capabilities: { events: true, userSync: true, doorOpen: false } }),
    ]);
    expect(first.items[0] ?? second.items[0]).toMatchObject({ userId: expect.stringMatching(/^N-m/), validEnd: '20261031', enabled: true, version: 1 });
    const doc = env.db.docs.get('tenants/t1/gymDeviceCommands/g1_m1');
    expect(doc).toMatchObject({ status: 'delivered', deliveredVersion: 1, attempts: 1, leaseUntil: '2026-09-28T12:01:00.000Z' });

    expect((await env.agents.work(a, 50, new Date(NOW.getTime() + 30_000))).items).toEqual([]);
    const redelivered = await env.agents.work(a, 50, new Date(NOW.getTime() + 61_000));
    expect(redelivered.items.map((item) => item.id).sort()).toEqual(['g1_m1', 'g1_m2', 'g1_m3']);
    expect(env.db.docs.get('tenants/t1/gymDeviceCommands/g1_m1')?.['attempts']).toBe(2);
  });

  it('never hands out another tenant or another agent gate', async () => {
    const { env, b, c } = await scenario();
    const forB = await env.agents.work(b, 50, NOW);
    expect(forB.items.map((item) => item.id)).toEqual(['g2_x1']);
    expect(forB.devices.map((device) => device.gateId)).toEqual(['g2']);
    const forC = await env.agents.work(c, 50, NOW);
    expect(forC.items.every((item) => item.gateId === 'g3')).toBe(true);
    // A gate id smuggled into the principal is ignored unless the gate points back at the agent.
    const forged = await env.agents.work({ ...c, gateIds: ['g3', 'g1'] }, 50, NOW);
    expect(forged.items.every((item) => item.gateId === 'g3')).toBe(true);
  });

  it('refuses acks for other tenants and other agents', async () => {
    const { env, a, b, c } = await scenario();
    await env.agents.work(a, 50, NOW);
    await expect(env.agents.ack(b, 'g1_m1', { version: 1, result: 'applied', verified: true }, NOW)).rejects.toMatchObject({
      code: ErrorCode.GYM_SYNC_ITEM_NOT_FOUND,
    });
    await expect(env.agents.ack(c, 'g1_m1', { version: 1, result: 'applied', verified: true }, NOW)).rejects.toMatchObject({
      code: ErrorCode.GYM_AGENT_FORBIDDEN,
    });
    expect(env.db.docs.get('tenants/t1/gymDeviceCommands/g1_m1')?.['status']).toBe('delivered');
  });

  it('applies only verified results and reports superseded versions', async () => {
    const { env, a } = await scenario();
    await env.agents.work(a, 50, NOW);
    await expect(env.agents.ack(a, 'g1_m1', { version: 1, result: 'applied', verified: false }, NOW)).rejects.toMatchObject({
      code: ErrorCode.GYM_SYNC_ACK_INVALID,
    });

    // The member's card changes while version 1 is on its way to the device.
    const changed = seedMember(env.db, 't1', 'm1', { rfidCardNumber: 'NEW-CARD' });
    await env.sync.syncMember('t1', changed, NOW);
    const before = env.db.docs.get('tenants/t1/gymDeviceCommands/g1_m1');
    expect(before).toMatchObject({ version: 2, status: 'pending', card: 'NEW-CARD', leaseUntil: null });
    await expect(env.agents.ack(a, 'g1_m1', { version: 1, result: 'applied', verified: true }, NOW)).resolves.toEqual({
      status: 'superseded',
      version: 2,
    });
    expect(env.db.docs.get('tenants/t1/gymDeviceCommands/g1_m1')).toEqual(before);

    await env.agents.work(a, 50, NOW);
    await expect(env.agents.ack(a, 'g1_m1', { version: 2, result: 'applied', verified: true }, NOW)).resolves.toMatchObject({
      status: 'applied',
    });
    expect(env.db.docs.get('tenants/t1/gymDeviceCommands/g1_m1')).toMatchObject({ status: 'applied', appliedVersion: 2, leaseUntil: null });

    await expect(
      env.agents.ack(a, 'g1_m2', { version: 1, result: 'error', verified: false, error: 'timeout' }, NOW),
    ).resolves.toMatchObject({ status: 'error' });
    expect(env.db.docs.get('tenants/t1/gymDeviceCommands/g1_m2')).toMatchObject({ status: 'error', lastError: 'timeout' });
  });
});

describe('desired-state recomputation', () => {
  it('writes only when the computed fields change and revokes cancelled members', async () => {
    const env = setup();
    seedGate(env.db, 't1', 'g1');
    seedGate(env.db, 't1', 'zk', { protocol: 'zk-tcp-4370' });
    const member = seedMember(env.db, 't1', 'm1');
    expect(await env.sync.syncMember('t1', member, NOW)).toBe(1);
    expect(await env.sync.syncMember('t1', { ...(member as object), notes: 'x' } as never, NOW)).toBe(0);
    expect(env.db.docs.has('tenants/t1/gymDeviceCommands/zk_m1')).toBe(false);

    await env.sync.syncMember('t1', { ...(member as object), membershipStatus: 'cancelled' } as never, NOW);
    expect(env.db.docs.get('tenants/t1/gymDeviceCommands/g1_m1')).toMatchObject({ enabled: false, version: 2, status: 'pending' });

    const stranger = seedMember(env.db, 't1', 'm2', { membershipStatus: 'expired' });
    expect(await env.sync.syncMember('t1', stranger, NOW)).toBe(0);
  });

  it('asks the agent to remove the old device user when the member number changes', async () => {
    const env = setup();
    seedGate(env.db, 't1', 'g1');
    const member = seedMember(env.db, 't1', 'm1');
    await env.sync.syncMember('t1', member, NOW);
    await env.sync.syncMember('t1', { ...(member as object), memberNumber: '2000' } as never, NOW);
    expect(env.db.docs.get('tenants/t1/gymDeviceCommands/g1_m1')).toMatchObject({ userId: '2000', replacesUserId: 'N-m1' });
  });

  it('resync queues every member, including ones to remove', async () => {
    const env = setup();
    seedGate(env.db, 't1', 'g1');
    seedMember(env.db, 't1', 'm1');
    seedMember(env.db, 't1', 'm2', { membershipStatus: 'cancelled' });
    const result = await env.context.run(admin('t1'), () => env.sync.resync('g1', NOW));
    expect(result).toEqual({ gateId: 'g1', queued: 2 });
    const summary = await env.context.run(admin('t1'), () => env.sync.summary());
    expect(summary).toEqual({ g1: { pending: 2, delivered: 0, applied: 0, error: 0 } });
  });
});

describe('events and heartbeat', () => {
  it('stores each device event once, with unknown status when the device gave no result', async () => {
    const env = setup();
    seedGate(env.db, 't1', 'g1');
    seedGate(env.db, 't2', 'g2');
    seedMember(env.db, 't1', 'm1');
    const a = principal(await pairAndEnroll(env, 't1', ['g1']));
    const event = {
      gateId: 'g1',
      eventId: 'yt-000123',
      userId: 'N-m1',
      card: null,
      time: '2026-09-28T21:14:05+03:00',
      direction: 'in',
      result: null,
      verifyMode: 'face',
    };
    const first = await env.agents.events(
      a,
      { events: [event, { ...event }, { ...event, eventId: 'yt-9', gateId: 'g2' }, { ...event, eventId: 'yt-10', time: 'x' }] },
      NOW,
    );
    expect(first).toEqual({
      accepted: 1,
      duplicates: 1,
      rejected: [
        { eventId: 'yt-9', reason: 'gate_forbidden' },
        { eventId: 'yt-10', reason: 'invalid_time' },
      ],
    });
    expect(await env.agents.events(a, { events: [event] }, NOW)).toEqual({ accepted: 0, duplicates: 1, rejected: [] });
    expect(env.db.docs.get('tenants/t1/gymAccessLogs/g1_yt-000123')).toMatchObject({
      status: 'unknown',
      source: 'agent',
      userId: 'm1',
      deviceUserId: 'N-m1',
      method: 'face',
      rawVerifyMode: 'face',
      timestamp: '2026-09-28T18:14:05.000Z',
    });
    expect([...env.db.docs.keys()].some((key) => key.startsWith('tenants/t2/gymAccessLogs'))).toBe(false);
  });

  it('marks gates online only while both the device and the agent report', async () => {
    const env = setup();
    seedGate(env.db, 't1', 'g1');
    seedGate(env.db, 't1', 'g9');
    const a = principal(await pairAndEnroll(env, 't1', ['g1']));
    await expect(
      env.agents.heartbeat(a, { devices: [{ gateId: 'g9', reachable: true }] }, NOW),
    ).rejects.toMatchObject({ code: ErrorCode.GYM_AGENT_FORBIDDEN });
    await env.agents.heartbeat(a, { agentVersion: '2.0.1', queueDepth: 3, devices: [{ gateId: 'g1', reachable: true }] }, NOW);

    const gates = await env.repo.listGates('t1');
    const at = (offset: number) =>
      env.context.run(admin('t1'), () => env.agents.decorateGates(gates, NOW.getTime() + offset));
    expect((await at(10_000)).find((gate) => gate.id === 'g1')).toMatchObject({ online: true, adapterStatus: 'hardware_pending' });
    expect((await at(31_000)).find((gate) => gate.id === 'g1')?.online).toBe(false);
    expect((await at(0)).find((gate) => gate.id === 'g9')?.online).toBe(false);
  });
});

describe('member lifecycle hooks', () => {
  it('recomputes device state after create, update, renew, freeze, cancel and delete', async () => {
    const { MembersService } = await import('../members/members.service');
    const member = { uid: 'm1', memberNumber: '1', membershipEndsAt: null, notes: null } as never;
    const repo = {
      create: jest.fn().mockResolvedValue(member),
      update: jest.fn().mockResolvedValue(member),
      save: jest.fn().mockImplementation(async (value: unknown) => value),
      getByIdOrThrow: jest.fn().mockResolvedValue(member),
      softDelete: jest.fn().mockResolvedValue(undefined),
    };
    const accessSync = { syncMemberSafely: jest.fn().mockResolvedValue(undefined) };
    const service = new MembersService(repo as never, accessSync as never);
    await service.create({} as never);
    await service.update('m1', {} as never);
    await service.renew('m1', { packageName: 'P', durationDays: 30 } as never);
    await service.freeze('m1', { freezeDays: 7 } as never);
    await service.cancel('m1', {} as never);
    await service.remove('m1');
    expect(accessSync.syncMemberSafely).toHaveBeenCalledTimes(6);
    expect(accessSync.syncMemberSafely.mock.calls[4][0]).toMatchObject({ membershipStatus: 'cancelled' });
    expect(accessSync.syncMemberSafely.mock.calls[5][0]).toMatchObject({ deletedAt: expect.any(String) });
  });
});
