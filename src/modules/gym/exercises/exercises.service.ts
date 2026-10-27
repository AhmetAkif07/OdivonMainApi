import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { BaseDocument } from '../../../shared/firestore/base-document';
import { GymStore } from '../shared/gym-store';
import { CreateExerciseDto, ExerciseQueryDto, UpdateExerciseDto } from './exercise.dto';
import { CatalogExercise, EQUIPMENT_LABELS, isSystemExerciseId, SYSTEM_EXERCISES } from './system-exercises';

type Doc = BaseDocument & Record<string, unknown>;

const NOT_FOUND = 'Exercise not found';

/**
 * Exercise catalogue: built-in `sys-ex-*` exercises, the gym's own (`gymExercises`, no owner)
 * and members' private ones (`gymExercises` with `ownerUid`, visible only to that member).
 */
@Injectable()
export class GymExercisesService {
  constructor(private readonly store: GymStore) {}

  /** Panel view: system + gym exercises (members' private ones stay private). */
  async listForStaff(query: ExerciseQueryDto) {
    const gym = (await this.store.list<Doc>(TENANT_COLLECTION.gymExercises)).filter((item) => !item['ownerUid']);
    return filterCatalog([...SYSTEM_EXERCISES, ...gym.map(toCatalogExercise)], query);
  }

  /** App view: system + gym + the member's own exercises. */
  async listForMember(query: ExerciseQueryDto) {
    const userId = this.store.userId();
    const custom = (await this.store.list<Doc>(TENANT_COLLECTION.gymExercises)).filter(
      (item) => !item['ownerUid'] || item['ownerUid'] === userId,
    );
    return filterCatalog([...SYSTEM_EXERCISES, ...custom.map(toCatalogExercise)], query);
  }

  async get(id: string) {
    const system = SYSTEM_EXERCISES.find((exercise) => exercise.id === id);
    if (system) return system;
    const item = await this.store.getOrThrow<Doc>(TENANT_COLLECTION.gymExercises, id, ErrorCode.GYM_EXERCISE_NOT_FOUND, NOT_FOUND);
    if (item['ownerUid'] && item['ownerUid'] !== this.store.userId()) {
      throw new AppException(ErrorCode.GYM_EXERCISE_NOT_FOUND, NOT_FOUND);
    }
    return toCatalogExercise(item);
  }

  async createForGym(dto: CreateExerciseDto) {
    const created = await this.store.create<Doc>(TENANT_COLLECTION.gymExercises, { ...fields(dto), ownerUid: null });
    return toCatalogExercise(created);
  }

  async createForMember(dto: CreateExerciseDto) {
    const created = await this.store.create<Doc>(TENANT_COLLECTION.gymExercises, {
      ...fields(dto),
      ownerUid: this.store.userId(),
    });
    return toCatalogExercise(created);
  }

  async updateForGym(id: string, dto: UpdateExerciseDto) {
    await this.gymOwned(id);
    const updated = await this.store.update<Doc>(
      TENANT_COLLECTION.gymExercises,
      id,
      ErrorCode.GYM_EXERCISE_NOT_FOUND,
      NOT_FOUND,
      fields(dto),
    );
    return toCatalogExercise(updated);
  }

  async removeForGym(id: string) {
    await this.gymOwned(id);
    return this.store.softDelete(TENANT_COLLECTION.gymExercises, id, ErrorCode.GYM_EXERCISE_NOT_FOUND, NOT_FOUND);
  }

  async removeForMember(id: string) {
    if (isSystemExerciseId(id)) throw new AppException(ErrorCode.GYM_EXERCISE_READONLY, 'Built-in exercises cannot be changed');
    const item = await this.store.getOrThrow<Doc>(TENANT_COLLECTION.gymExercises, id, ErrorCode.GYM_EXERCISE_NOT_FOUND, NOT_FOUND);
    if (item['ownerUid'] !== this.store.userId()) {
      throw new AppException(ErrorCode.GYM_EXERCISE_NOT_FOUND, NOT_FOUND);
    }
    return this.store.softDelete(TENANT_COLLECTION.gymExercises, id, ErrorCode.GYM_EXERCISE_NOT_FOUND, NOT_FOUND);
  }

  /** Staff edit only the gym's exercises: built-in ones are read only, members' are private. */
  private async gymOwned(id: string) {
    if (isSystemExerciseId(id)) throw new AppException(ErrorCode.GYM_EXERCISE_READONLY, 'Built-in exercises cannot be changed');
    const item = await this.store.getOrThrow<Doc>(TENANT_COLLECTION.gymExercises, id, ErrorCode.GYM_EXERCISE_NOT_FOUND, NOT_FOUND);
    if (item['ownerUid']) throw new AppException(ErrorCode.GYM_EXERCISE_NOT_FOUND, NOT_FOUND);
    return item;
  }
}

function repsOrUndefined(value: unknown): number | string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 50);
  return undefined;
}

/** Plain fields to store (no DTO class instances; Firestore rejects those). */
function fields(dto: CreateExerciseDto | UpdateExerciseDto) {
  return {
    name: dto.name?.trim(),
    nameEn: dto.nameEn?.trim(),
    muscleGroup: dto.muscleGroup,
    primaryMuscle: dto.primaryMuscle?.trim(),
    secondaryMuscles: dto.secondaryMuscles ? [...dto.secondaryMuscles] : undefined,
    equipment: dto.equipment,
    equipmentName: dto.equipmentName?.trim(),
    mechanic: dto.mechanic,
    trackingType: dto.trackingType,
    defaultSets: dto.defaultSets,
    defaultReps: repsOrUndefined(dto.defaultReps),
    defaultRestSeconds: dto.defaultRestSeconds,
    instructions: dto.instructions ? dto.instructions.map((line) => line.trim()).filter(Boolean) : undefined,
    imageUrl: dto.imageUrl,
  };
}

export function toCatalogExercise(item: Doc): CatalogExercise {
  const equipment = (item['equipment'] as CatalogExercise['equipment']) ?? 'other';
  const muscleGroup = (item['muscleGroup'] as CatalogExercise['muscleGroup']) ?? 'fullbody';
  return {
    id: item.id,
    source: item['ownerUid'] ? 'member' : 'gym',
    name: String(item['name'] ?? ''),
    nameEn: String(item['nameEn'] ?? item['name'] ?? ''),
    muscleGroup,
    primaryMuscle: String(item['primaryMuscle'] ?? muscleGroup),
    secondaryMuscles: Array.isArray(item['secondaryMuscles']) ? (item['secondaryMuscles'] as string[]) : [],
    equipment,
    equipmentName: String(item['equipmentName'] || EQUIPMENT_LABELS[equipment] || EQUIPMENT_LABELS.other),
    mechanic: item['mechanic'] === 'isolation' ? 'isolation' : 'compound',
    trackingType: (item['trackingType'] as CatalogExercise['trackingType']) ?? 'weight_reps',
    defaultSets: typeof item['defaultSets'] === 'number' ? item['defaultSets'] : 3,
    defaultReps: repsOrUndefined(item['defaultReps']) ?? 10,
    defaultRestSeconds: typeof item['defaultRestSeconds'] === 'number' ? item['defaultRestSeconds'] : 60,
    instructions: Array.isArray(item['instructions']) ? (item['instructions'] as string[]) : [],
    imageUrl: (item['imageUrl'] as string | null) ?? null,
  };
}

/** Case- and accent-insensitive text search ("gogus" finds "Göğüs") plus facet filters. */
export function filterCatalog(items: CatalogExercise[], query: ExerciseQueryDto): CatalogExercise[] {
  const needle = fold(query.q ?? '');
  return items
    .filter((item) => !query.muscleGroup || item.muscleGroup === query.muscleGroup)
    .filter((item) => !query.equipment || item.equipment === query.equipment)
    .filter((item) => !query.source || item.source === query.source)
    .filter((item) => !needle || fold(`${item.name} ${item.nameEn} ${item.primaryMuscle}`).includes(needle))
    .sort((left, right) => left.name.localeCompare(right.name, 'tr'));
}

function fold(value: string): string {
  return value
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}
