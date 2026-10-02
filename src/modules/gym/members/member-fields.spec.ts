import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateStaffDto, UpdateStaffDto } from '../staff/staff.dto';
import { CreateMemberDto, UpdateMemberDto } from './member.dto';

const whitelist = { whitelist: true, forbidNonWhitelisted: true };

function errors<T extends object>(cls: new () => T, body: object): string[] {
  return validateSync(plainToInstance(cls, body), whitelist).map((error) => error.property);
}

describe('fields sent by the gym panel', () => {
  const member = { displayName: 'Ayşe Yılmaz', email: 'ayse@example.com', password: 'secret123' };

  it('accepts valid nationalId on CreateMemberDto', () => {
    expect(errors(CreateMemberDto, { ...member, nationalId: '10000000146' })).toEqual([]);
  });

  it('rejects missing or empty nationalId on CreateMemberDto', () => {
    expect(errors(CreateMemberDto, { ...member, nationalId: undefined })).toContain('nationalId');
    expect(errors(CreateMemberDto, { ...member, nationalId: null })).toContain('nationalId');
    expect(errors(CreateMemberDto, { ...member, nationalId: '' })).toContain('nationalId');
  });

  it.each(['01234567890', '1234567890', '123456789012', '1234567890a', ''])(
    'rejects invalid nationalId format %j',
    (nationalId) => {
      expect(errors(CreateMemberDto, { ...member, nationalId })).toContain('nationalId');
      expect(errors(UpdateMemberDto, { nationalId })).toContain('nationalId');
    },
  );

  it('accepts multi-branch staff', () => {
    const staff = { displayName: 'Can', email: 'can@example.com', branchIds: ['b1', 'b2'], branchNames: ['Merkez', 'Kadıköy'] };
    expect(errors(CreateStaffDto, staff)).toEqual([]);
    expect(errors(UpdateStaffDto, { branchIds: [] })).toEqual([]);
    expect(errors(UpdateStaffDto, { branchIds: 'b1' })).toEqual(['branchIds']);
  });
});
