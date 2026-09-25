import { compareExaminationsByDateDesc } from './examinations.repository';
import { Examination } from './entities/examination.entity';

function examination(id: string, date: string): Examination {
  return { id, date } as Examination;
}

describe('compareExaminationsByDateDesc', () => {
  it('sorts by date descending', () => {
    const items = [
      examination('a', '2026-09-10T09:00:00.000Z'),
      examination('b', '2026-09-25T11:00:00.000Z'),
      examination('c', '2026-09-18T08:00:00.000Z'),
    ].sort(compareExaminationsByDateDesc);

    expect(items.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });
});
