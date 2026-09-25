import {
  clinicDateKey,
  compareVaccineSchedulesForList,
} from './vaccine-schedules.repository';
import { VaccineSchedule } from './vaccine-schedule.entity';

function schedule(id: string, dueAt: string): VaccineSchedule {
  return { id, dueAt } as VaccineSchedule;
}

describe('compareVaccineSchedulesForList', () => {
  const todayKey = clinicDateKey('2026-09-25T12:00:00.000Z');

  it('puts today first, then remaining dueAt descending', () => {
    const items = [
      schedule('past', '2026-09-20T09:00:00.000Z'),
      schedule('future', '2026-10-02T09:00:00.000Z'),
      schedule('today-morning', '2026-09-25T07:00:00.000Z'),
      schedule('today-afternoon', '2026-09-25T15:00:00.000Z'),
      schedule('yesterday', '2026-09-24T18:00:00.000Z'),
    ].sort((left, right) => compareVaccineSchedulesForList(left, right, todayKey));

    expect(items.map((item) => item.id)).toEqual([
      'today-afternoon',
      'today-morning',
      'future',
      'yesterday',
      'past',
    ]);
  });
});
