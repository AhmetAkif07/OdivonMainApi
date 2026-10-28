import { lessonConflicts } from './driving-school.service';

const existing = { id:'lesson-1',studentId:'student-1',instructorId:'instructor-1',vehicleId:'vehicle-1',startsAt:'2026-10-17T09:00:00.000Z',endsAt:'2026-10-17T10:00:00.000Z',deletedAt:null };
describe('driving school lesson conflicts',()=>{
  it('rejects overlapping use of the same instructor',()=>{expect(lessonConflicts(existing,{id:'lesson-2',studentId:'student-2',instructorId:'instructor-1',vehicleId:'vehicle-2',startsAt:'2026-10-17T09:30:00.000Z',endsAt:'2026-10-17T10:30:00.000Z'})).toBe(true);});
  it('allows adjacent lessons and unrelated resources',()=>{expect(lessonConflicts(existing,{id:'lesson-2',studentId:'student-2',instructorId:'instructor-2',vehicleId:'vehicle-2',startsAt:'2026-10-17T10:00:00.000Z',endsAt:'2026-10-17T11:00:00.000Z'})).toBe(false);});
  it('ignores a soft-deleted lesson',()=>{expect(lessonConflicts({...existing,deletedAt:'2026-10-17T08:00:00.000Z'},{id:'lesson-2',studentId:'student-1',instructorId:'instructor-2',vehicleId:'vehicle-2',startsAt:'2026-10-17T09:30:00.000Z',endsAt:'2026-10-17T10:30:00.000Z'})).toBe(false);});
});
