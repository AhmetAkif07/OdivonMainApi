import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { AgendaRecurrenceDto, CreateAgendaDto, UpdateAgendaDto } from './agenda.dto';
import { AgendaItem, AgendaRecurrence, AgendaScope } from './agenda.entity';
import { AgendaFields, AgendaRepository } from './agenda.repository';
import { isOpenEnded, occurrences, OPEN_HORIZON_DAYS, TOP_UP_THRESHOLD_DAYS } from './agenda.recurrence';

const DAY_MS = 86_400_000;

type SeriesBase = Pick<AgendaItem, 'title' | 'type' | 'priority' | 'notes'>;

function cleanRule(dto: AgendaRecurrenceDto | AgendaRecurrence, startAt: string): AgendaRecurrence {
  const rule: AgendaRecurrence = {
    frequency: dto.frequency,
    interval: Math.max(1, Math.floor(dto.interval || 1)),
    until: dto.until ? dto.until.slice(0, 10) : null,
    count: dto.count ?? null,
    startAt,
  };
  if (dto.frequency === 'weekly' && dto.weekdays?.length) {
    rule.weekdays = [...new Set(dto.weekdays)].sort((a, b) => a - b);
  }
  if (dto.utcOffsetMinutes !== undefined) {
    rule.utcOffsetMinutes = dto.utcOffsetMinutes;
  }
  return rule;
}

function shiftIso(iso: string, deltaMs: number): string {
  return new Date(new Date(iso).getTime() + deltaMs).toISOString();
}

@Injectable()
export class AgendaService {
  constructor(private readonly agenda: AgendaRepository) {}

  async create(dto: CreateAgendaDto): Promise<AgendaItem> {
    if (!dto.recurrence) {
      return this.agenda.create(dto);
    }
    const items = await this.createSeries(
      { title: dto.title.trim(), type: dto.type, priority: dto.priority, notes: dto.notes || null },
      cleanRule(dto.recurrence, dto.dueAt),
    );
    return items[0];
  }

  /** Materializes a new series; the first item's id is the series id. */
  private async createSeries(base: SeriesBase, rule: AgendaRecurrence, seriesId = this.agenda.newId()): Promise<AgendaItem[]> {
    const list = occurrences(rule.startAt!, rule);
    if (!list.length) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Tekrar kuralı hiç tarih üretmiyor; bitiş tarihini kontrol edin');
    }
    const fields: AgendaFields[] = list.map((occurrence) => ({
      ...base,
      dueAt: occurrence.dueAt,
      done: false,
      seriesId,
      occurrenceIndex: occurrence.index,
      recurrence: rule,
    }));
    return this.agenda.createMany(fields, [seriesId]);
  }

  getById(id: string) {
    return this.agenda.getByIdOrThrow(id);
  }

  async list(query: PagingQueryDto) {
    let items = await this.agenda.collect();
    const added = await this.topUp(items);
    if (added.length) {
      items = [...items, ...added].sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id));
    }
    const filtered = items.filter((item) => matchesColumnFilters(item, query.filters));
    return paginateInMemory(filtered, query.limit, query.cursor);
  }

  /** Extends open-ended series whose last item is less than TOP_UP_THRESHOLD_DAYS away. */
  async topUp(items: AgendaItem[], now = new Date()): Promise<AgendaItem[]> {
    const last = new Map<string, AgendaItem>();
    for (const item of items) {
      if (!item.seriesId || !item.recurrence || !isOpenEnded(item.recurrence)) continue;
      const current = last.get(item.seriesId);
      if (!current || (item.occurrenceIndex ?? 0) > (current.occurrenceIndex ?? 0)) last.set(item.seriesId, item);
    }
    const threshold = now.getTime() + TOP_UP_THRESHOLD_DAYS * DAY_MS;
    const horizon = new Date(now.getTime() + OPEN_HORIZON_DAYS * DAY_MS);
    const created: AgendaItem[] = [];
    for (const [seriesId, item] of last) {
      if (new Date(item.dueAt).getTime() >= threshold) continue;
      // Deleted items still count, so a deleted last occurrence is not brought back.
      const all = await this.agenda.seriesItems(seriesId, true);
      const maxIndex = Math.max(...all.map((entry) => entry.occurrenceIndex ?? 0));
      const rule = item.recurrence!;
      const next = occurrences(rule.startAt ?? item.dueAt, rule, maxIndex + 1, horizon);
      if (!next.length) continue;
      const fields: AgendaFields[] = next.map((occurrence) => ({
        title: item.title,
        type: item.type,
        priority: item.priority,
        notes: item.notes,
        dueAt: occurrence.dueAt,
        done: false,
        seriesId,
        occurrenceIndex: occurrence.index,
        recurrence: rule,
      }));
      created.push(...(await this.agenda.createMany(fields)));
    }
    return created;
  }

  async update(id: string, dto: UpdateAgendaDto, scope: AgendaScope = 'single'): Promise<AgendaItem> {
    const item = await this.agenda.getByIdOrThrow(id);

    if (!item.seriesId) {
      if (!dto.recurrence) {
        return this.agenda.update(id, dto);
      }
      // A plain task becomes the first item of a new series (same id).
      const items = await this.createSeries(
        {
          title: dto.title?.trim() ?? item.title,
          type: dto.type ?? item.type,
          priority: dto.priority ?? item.priority,
          notes: dto.notes === undefined ? item.notes : dto.notes || null,
        },
        cleanRule(dto.recurrence, dto.dueAt ?? item.dueAt),
        id,
      );
      return items[0];
    }

    if (scope === 'single') {
      const { recurrence: _ignored, ...rest } = dto;
      return this.agenda.update(id, rest);
    }

    const series = await this.agenda.seriesItems(item.seriesId);
    const fromIndex = scope === 'following' ? item.occurrenceIndex ?? 0 : 0;
    const targets = series.filter((entry) => (entry.occurrenceIndex ?? 0) >= fromIndex);
    const before = series.filter((entry) => (entry.occurrenceIndex ?? 0) < fromIndex);
    const base: SeriesBase = {
      title: dto.title?.trim() ?? item.title,
      type: dto.type ?? item.type,
      priority: dto.priority ?? item.priority,
      notes: dto.notes === undefined ? item.notes : dto.notes || null,
    };
    const delta = dto.dueAt ? new Date(dto.dueAt).getTime() - new Date(item.dueAt).getTime() : 0;

    // New times or a new rule: end the old series at the split point and generate a new one.
    if (delta !== 0 || dto.recurrence !== undefined) {
      const oldRule = item.recurrence!;
      const startAt = shiftIso(scope === 'series' ? oldRule.startAt ?? (targets[0] ?? item).dueAt : item.dueAt, delta);
      const keepDone = targets.filter((entry) => entry.done && entry.id !== item.id);
      const toDelete = targets.filter((entry) => !keepDone.includes(entry));
      await this.agenda.saveMany(
        toDelete.map((entry) => ({ ...entry, deletedAt: new Date().toISOString() })),
        'deleted',
      );
      await this.endSeries([...before, ...keepDone]);
      if (dto.recurrence === null) {
        // Repeat switched off: keep only this item, as a plain task.
        return this.agenda.create({ ...base, notes: base.notes, dueAt: shiftIso(item.dueAt, delta), done: dto.done ?? item.done });
      }
      const ruleSource = dto.recurrence ?? {
        ...oldRule,
        count: oldRule.count ? Math.max(1, oldRule.count - fromIndex) : null,
      };
      const items = await this.createSeries(base, cleanRule(ruleSource, startAt));
      return items[0];
    }

    // Only text fields changed: patch the targets in place.
    const patched = targets.map((entry) => ({
      ...entry,
      ...base,
      done: entry.id === item.id && dto.done !== undefined ? dto.done : entry.done,
    }));
    const saved = await this.agenda.saveMany(patched);
    return saved.find((entry) => entry.id === item.id) ?? saved[0];
  }

  async softDelete(id: string, scope: AgendaScope = 'single'): Promise<void> {
    const item = await this.agenda.getByIdOrThrow(id);
    if (!item.seriesId || scope === 'single') {
      return this.agenda.softDelete(id);
    }
    const series = await this.agenda.seriesItems(item.seriesId);
    const fromIndex = scope === 'following' ? item.occurrenceIndex ?? 0 : 0;
    const targets = series.filter((entry) => (entry.occurrenceIndex ?? 0) >= fromIndex);
    await this.agenda.saveMany(
      targets.map((entry) => ({ ...entry, deletedAt: new Date().toISOString() })),
      'deleted',
    );
    await this.endSeries(series.filter((entry) => (entry.occurrenceIndex ?? 0) < fromIndex));
  }

  /** Caps the rule on the items left in an old series so it is never extended again. */
  private async endSeries(remaining: AgendaItem[]): Promise<void> {
    if (!remaining.length) return;
    const count = Math.max(...remaining.map((entry) => entry.occurrenceIndex ?? 0)) + 1;
    await this.agenda.saveMany(
      remaining.map((entry) => ({ ...entry, recurrence: entry.recurrence ? { ...entry.recurrence, count } : null })),
    );
  }
}
