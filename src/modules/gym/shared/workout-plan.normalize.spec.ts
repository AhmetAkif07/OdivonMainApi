import {
  cleanDays,
  daysFromExercises,
  exercisesFromDays,
  normalizePlanContent,
  parseDayName,
  readPlanDays,
} from './workout-plan.normalize';

describe('workout plan normalize', () => {
  it('parses legacy day names', () => {
    expect(parseDayName('2. Gün: İtiş')).toEqual({ order: 2, name: 'İtiş' });
    expect(parseDayName('1. Gün')).toEqual({ order: 1, name: '' });
    expect(parseDayName('Göğüs')).toEqual({ order: null, name: 'Göğüs' });
    expect(parseDayName(null)).toEqual({ order: null, name: '' });
  });

  it('groups legacy exercises into ordered days', () => {
    const days = daysFromExercises([
      { name: 'Squat', dayName: '2. Gün: Bacak', sets: 4, reps: 8 },
      { name: 'Bench Press', dayName: '1. Gün: Göğüs', sets: 3, reps: '8-10' },
      { name: 'Plank', reps: '45 sn' },
      { name: '' },
    ]);
    expect(days.map((day) => [day.order, day.name, day.exercises.map((exercise) => exercise.name)])).toEqual([
      [1, 'Göğüs', ['Bench Press', 'Plank']],
      [2, 'Bacak', ['Squat']],
    ]);
    expect(days[0].exercises[0].dayName).toBeUndefined();
    expect(days[0].exercises[0].id).toBeTruthy();
  });

  it('closes gaps in day numbers', () => {
    const days = daysFromExercises([
      { name: 'A', dayName: '1. Gün' },
      { name: 'B', dayName: '3. Gün' },
    ]);
    expect(days.map((day) => [day.order, day.id])).toEqual([
      [1, 'day-1'],
      [2, 'day-2'],
    ]);
  });

  it('round-trips days through the legacy list without losing data', () => {
    const days = cleanDays([
      {
        id: 'd1',
        name: 'İtiş',
        exercises: [
          {
            id: 'e1',
            exerciseId: 'sys-ex-bench-press',
            name: 'Bench Press',
            sets: 3,
            reps: 10,
            weight: 60,
            restSeconds: 90,
            setTargets: [{ reps: 12, weight: 40, type: 'warmup' }, { reps: 10, weight: 60 }],
            supersetGroup: 'A',
          },
        ],
      },
      { id: 'd2', name: 'Çekiş', exercises: [{ id: 'e2', name: 'Barfiks', reps: 'max' }] },
    ]);
    const legacy = exercisesFromDays(days);
    expect(legacy.map((exercise) => exercise.dayName)).toEqual(['1. Gün: İtiş', '2. Gün: Çekiş']);
    const back = daysFromExercises(legacy);
    expect(back.map((day) => day.name)).toEqual(['İtiş', 'Çekiş']);
    expect(back[0].exercises[0]).toEqual(days[0].exercises[0]);
    expect(back[0].exercises[0].setTargets).toEqual([
      { reps: 12, weight: 40, type: 'warmup' },
      { reps: 10, weight: 60, type: 'normal' },
    ]);
  });

  it('drops unknown fields and keeps nested supersets one level deep', () => {
    const [day] = cleanDays([
      {
        name: 'X',
        hack: true,
        exercises: [{ name: 'A', evil: 1, superSet: { name: 'B', superSet: { name: 'C' } } }],
      },
    ]);
    expect(day).not.toHaveProperty('hack');
    expect(day.exercises[0]).not.toHaveProperty('evil');
    expect(day.exercises[0].superSet?.name).toBe('B');
    expect(day.exercises[0].superSet?.superSet).toBeUndefined();
  });

  it('prefers days over exercises on write and leaves both alone when neither is sent', () => {
    const content = normalizePlanContent({
      days: [{ name: 'A', exercises: [{ name: 'Squat' }] }],
      exercises: [{ name: 'Ignored' }],
    });
    expect(content.exercises?.map((exercise) => exercise.name)).toEqual(['Squat']);
    expect(normalizePlanContent({})).toEqual({});
    const legacyOnly = normalizePlanContent({ exercises: [{ name: 'Row', dayName: '1. Gün: Sırt' }] });
    expect(legacyOnly.days?.[0].name).toBe('Sırt');
  });

  it('reads days from stored days or from the legacy list', () => {
    expect(readPlanDays({ exercises: [{ name: 'A', dayName: '1. Gün' }] })[0].exercises[0].name).toBe('A');
    expect(readPlanDays({ days: [{ id: 'x', name: 'Y', exercises: [] }] })[0]).toMatchObject({ id: 'x', name: 'Y', order: 1 });
    expect(readPlanDays({})).toEqual([]);
  });
});
