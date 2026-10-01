/**
 * In-memory Firestore with the subset of the Admin SDK used by the services under test (tests only;
 * excluded from the build). Transactions are serialised like conflicting Firestore transactions and
 * their writes apply at commit.
 */

export type Data = Record<string, unknown>;
type Filter = { field: string; op: '==' | 'in' | '<'; value: unknown };

function firestoreError(code: number, message: string) {
  return Object.assign(new Error(message), { code });
}

export interface FakeSnapshot {
  id: string;
  ref: FakeDocRef;
  exists: boolean;
  data(): Data | undefined;
}

export class FakeFirestore {
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
    return `auto${String(this.seq).padStart(4, '0')}`;
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
        delete: (ref: FakeDocRef) => writes.push(() => this.docs.delete(ref.path)),
      };
      const result = await fn(tx);
      writes.forEach((write) => write());
      return result;
    });
    this.lock = run.catch(() => undefined);
    return run;
  }
}

export class FakeDocRef {
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

  get firestore() {
    return this.db;
  }

  snapshot(): FakeSnapshot {
    const data = this.db.docs.get(this.path);
    return { id: this.id, ref: this, exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
  }

  async get(): Promise<FakeSnapshot> {
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

export class FakeQuery {
  constructor(
    private readonly db: FakeFirestore,
    private readonly path: string,
    private readonly filters: Filter[],
    private readonly max: number | undefined,
  ) {}

  get firestore() {
    return this.db;
  }

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
