import { compareAppointmentsByBeginDesc } from './appointments.repository';
import { Appointment } from './entities/appointment.entity';

function appointment(id: string, beginAt: string): Appointment {
  return { id, beginAt } as Appointment;
}

describe('compareAppointmentsByBeginDesc', () => {
  it('sorts by beginAt descending', () => {
    const items = [
      appointment('a', '2026-09-20T09:00:00.000Z'),
      appointment('b', '2026-09-25T11:00:00.000Z'),
      appointment('c', '2026-09-22T08:00:00.000Z'),
    ].sort(compareAppointmentsByBeginDesc);

    expect(items.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });
});
