import { AgendaItem, AgendaRecurrence } from './agenda.entity';
import { isOpenEnded, occurrences } from './agenda.recurrence';
import { AgendaService } from './agenda.service';

const dates = (list: { dueAt: string }[]) => list.map((item) => item.dueAt);

describe('agenda recurrence', () => {
  it('repeats daily with an interval and a count', () => {
    const rule: AgendaRecurrence = { frequency: 'daily', interval: 2, count: 3 };
    expect(dates(occurrences('2026-11-04T06:00:00.000Z', rule))).toEqual([
      '2026-11-04T06:00:00.000Z',
      '2026-11-06T06:00:00.000Z',
      '2026-11-08T06:00:00.000Z',
    ]);
  });

  it('repeats on chosen weekdays in clinic time (UTC+3)', () => {
    // Wed 2026-11-04 01:00 in Türkiye = Tue 22:00 UTC. Mon/Wed/Fri, two weeks.
    const rule: AgendaRecurrence = { frequency: 'weekly', interval: 1, weekdays: [1, 3, 5], until: '2026-11-13' };
    expect(dates(occurrences('2026-11-03T22:00:00.000Z', rule))).toEqual([
      '2026-11-03T22:00:00.000Z', // Wed 4th local
      '2026-11-05T22:00:00.000Z', // Fri 6th
      '2026-11-08T22:00:00.000Z', // Mon 9th
      '2026-11-10T22:00:00.000Z', // Wed 11th
      '2026-11-12T22:00:00.000Z', // Fri 13th
    ]);
  });

  it('keeps Sunday last in a week and honours the week interval', () => {
    const rule: AgendaRecurrence = { frequency: 'weekly', interval: 2, weekdays: [0, 6], count: 4, utcOffsetMinutes: 0 };
    // Sat 2026-11-07
    expect(dates(occurrences('2026-11-07T09:00:00.000Z', rule))).toEqual([
      '2026-11-07T09:00:00.000Z',
      '2026-11-08T09:00:00.000Z',
      '2026-11-21T09:00:00.000Z',
      '2026-11-22T09:00:00.000Z',
    ]);
  });

  it('clamps monthly dates to the end of shorter months', () => {
    const rule: AgendaRecurrence = { frequency: 'monthly', interval: 1, count: 3, utcOffsetMinutes: 0 };
    expect(dates(occurrences('2027-01-31T09:00:00.000Z', rule))).toEqual([
      '2027-01-31T09:00:00.000Z',
      '2027-02-28T09:00:00.000Z',
      '2027-03-31T09:00:00.000Z',
    ]);
  });

  it('stops open-ended rules at the horizon and continues from an index', () => {
    const rule: AgendaRecurrence = { frequency: 'yearly', interval: 1 };
    expect(isOpenEnded(rule)).toBe(true);
    const list = occurrences('2026-01-01T09:00:00.000Z', rule, 2, new Date('2030-06-01T00:00:00.000Z'));
    expect(list.map((item) => item.index)).toEqual([2, 3, 4]);
    expect(list[0].dueAt.startsWith('2028-01-01')).toBe(true);
  });
});

describe('AgendaService', () => {
  const repo = {
    create: jest.fn(),
    createMany: jest.fn(),
    saveMany: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    collect: jest.fn(),
    getByIdOrThrow: jest.fn(),
    seriesItems: jest.fn(),
    newId: jest.fn(() => 'series1'),
  };
  let service: AgendaService;

  function item(index: number, overrides: Partial<AgendaItem> = {}): AgendaItem {
    return {
      id: `o${index}`,
      title: 'İlaç ver',
      type: 'task',
      priority: 'normal',
      notes: null,
      done: false,
      dueAt: new Date(Date.UTC(2026, 10, 4 + index, 6)).toISOString(),
      seriesId: 'series1',
      occurrenceIndex: index,
      recurrence: { frequency: 'daily', interval: 1, count: 5, startAt: '2026-11-04T06:00:00.000Z' },
      createdAt: '',
      updatedAt: '',
      createdBy: '',
      updatedBy: '',
      deletedAt: null,
      ...overrides,
    } as AgendaItem;
  }

  beforeEach(() => {
    jest.resetAllMocks();
    repo.newId.mockReturnValue('series1');
    repo.createMany.mockImplementation(async (fields, ids = []) =>
      fields.map((f: object, i: number) => ({ id: ids[i] ?? `n${i}`, ...f })),
    );
    repo.saveMany.mockImplementation(async (items) => items);
    service = new AgendaService(repo as never);
  });

  it('materializes a repeating task with the first id as series id', async () => {
    const first = await service.create({
      title: 'Kontrol',
      type: 'call',
      priority: 'high',
      dueAt: '2026-11-04T06:00:00.000Z',
      recurrence: { frequency: 'weekly', interval: 1, count: 4 },
    });
    const [fields, ids] = repo.createMany.mock.calls[0];
    expect(fields).toHaveLength(4);
    expect(ids).toEqual(['series1']);
    expect(first).toMatchObject({ id: 'series1', seriesId: 'series1', occurrenceIndex: 0 });
    expect(fields[3].dueAt).toBe('2026-11-25T06:00:00.000Z');
  });

  it('creates a plain task without recurrence', async () => {
    repo.create.mockResolvedValue({ id: 'x' });
    await service.create({ title: 'Tek', type: 'task', priority: 'low', dueAt: '2026-11-04T06:00:00.000Z' });
    expect(repo.create).toHaveBeenCalled();
    expect(repo.createMany).not.toHaveBeenCalled();
  });

  it('deletes this and following items and caps the rule on the earlier ones', async () => {
    const series = [0, 1, 2, 3, 4].map((i) => item(i));
    repo.getByIdOrThrow.mockResolvedValue(series[2]);
    repo.seriesItems.mockResolvedValue(series);
    await service.softDelete('o2', 'following');
    const [deleted, action] = repo.saveMany.mock.calls[0];
    expect(action).toBe('deleted');
    expect(deleted.map((e: AgendaItem) => e.id)).toEqual(['o2', 'o3', 'o4']);
    const capped = repo.saveMany.mock.calls[1][0];
    expect(capped.map((e: AgendaItem) => e.recurrence!.count)).toEqual([2, 2]);
  });

  it('patches text fields on the whole series without regenerating', async () => {
    const series = [0, 1, 2].map((i) => item(i));
    repo.getByIdOrThrow.mockResolvedValue(series[1]);
    repo.seriesItems.mockResolvedValue(series);
    await service.update('o1', { title: 'Yeni başlık' }, 'series');
    expect(repo.createMany).not.toHaveBeenCalled();
    expect(repo.saveMany.mock.calls[0][0].map((e: AgendaItem) => e.title)).toEqual(['Yeni başlık', 'Yeni başlık', 'Yeni başlık']);
  });

  it('moves following items to a new time by splitting the series', async () => {
    const series = [0, 1, 2, 3, 4].map((i) => item(i));
    repo.getByIdOrThrow.mockResolvedValue(series[3]);
    repo.seriesItems.mockResolvedValue(series);
    repo.newId.mockReturnValue('series2');
    await service.update('o3', { dueAt: '2026-11-07T08:00:00.000Z' }, 'following');
    const fields = repo.createMany.mock.calls[0][0];
    // old count 5 minus split index 3 → 2 new items, two hours later
    expect(fields.map((f: AgendaItem) => f.dueAt)).toEqual(['2026-11-07T08:00:00.000Z', '2026-11-08T08:00:00.000Z']);
    expect(fields[0].seriesId).toBe('series2');
  });

  it('only changes the single occurrence when scope is single', async () => {
    repo.getByIdOrThrow.mockResolvedValue(item(1));
    await service.update('o1', { done: true, recurrence: { frequency: 'daily', interval: 3 } }, 'single');
    expect(repo.update).toHaveBeenCalledWith('o1', { done: true });
  });

  it('tops up an open-ended series that is running out', async () => {
    const open = item(0, {
      dueAt: '2026-11-04T06:00:00.000Z',
      recurrence: { frequency: 'monthly', interval: 1, startAt: '2026-11-04T06:00:00.000Z' },
    });
    repo.seriesItems.mockResolvedValue([open]);
    const created = await service.topUp([open], new Date('2026-11-04T07:00:00.000Z'));
    expect(created.length).toBe(12);
    expect(repo.createMany.mock.calls[0][0][0].occurrenceIndex).toBe(1);
  });
});
