import { buildBranchReport, UNASSIGNED } from './branch-report.math';

describe('buildBranchReport', () => {
  const now = new Date('2026-09-20T12:00:00Z');
  const base = {
    branches: [
      { id: 'b1', name: 'Merkez', capacity: 100, status: 'active' },
      { id: 'b2', name: 'Kadıköy', capacity: 50, status: 'active' },
      { id: 'b3', name: 'Kapalı', status: 'closed' },
    ],
    members: [
      { uid: 'm1', branchId: 'b1', membershipStatus: 'active', membershipEndsAt: '2026-12-01T00:00:00Z', createdAt: '2026-09-05T10:00:00Z' },
      { uid: 'm2', branchId: 'b1', membershipStatus: 'expired', createdAt: '2026-01-01T10:00:00Z' },
      { uid: 'm3', branchId: 'b2', membershipStatus: 'active', membershipEndsAt: '2026-09-01T00:00:00Z', createdAt: '2026-08-01T10:00:00Z' },
      { uid: 'm4', branchId: null, membershipStatus: 'active', createdAt: '2026-09-10T10:00:00Z' },
      { uid: 'm5', branchId: 'b2', membershipStatus: 'active', isArchived: true },
    ],
    entries: [
      { type: 'income', amount: 1000, entryDate: '2026-09-06T10:00:00Z', userId: 'm1' },
      { type: 'income', amount: 500, entryDate: '2026-09-07T10:00:00Z', branchId: 'b2' },
      { type: 'expense', amount: 200, entryDate: '2026-09-08T10:00:00Z', branchId: 'b1' },
      { type: 'income', amount: 300, entryDate: '2026-09-09T10:00:00Z' },
      { type: 'income', amount: 700, entryDate: '2026-08-15T10:00:00Z', userId: 'm3' },
      { type: 'income', amount: 'x', entryDate: '2026-09-09T10:00:00Z' },
    ],
    events: [
      { userId: 'm1', status: 'granted', direction: 'in', timestamp: '2026-09-06T08:00:00Z' },
      { userId: 'm1', status: 'granted', direction: 'out', timestamp: '2026-09-06T09:00:00Z' },
      { userId: 'm3', status: 'denied', direction: 'in', timestamp: '2026-09-06T08:00:00Z' },
      { userId: 'm3', status: 'granted', direction: 'in', timestamp: '2026-09-07T08:00:00Z' },
      { userId: 'm1', status: 'granted', direction: 'in', timestamp: '2026-08-30T08:00:00Z' },
    ],
    from: '2026-09-01',
    to: '2026-09-10',
    months: ['2026-08', '2026-09'],
    now,
  };

  it('attributes records to branches and keeps the rest as unassigned', () => {
    const report = buildBranchReport(base);
    const byId = Object.fromEntries(report.rows.map((row) => [row.branchId, row]));
    expect(report.rows.map((row) => row.branchId)).toEqual(['b1', 'b2', UNASSIGNED]);
    expect(byId['b1']).toMatchObject({ totalMembers: 2, activeMembers: 1, newMembers: 1, revenue: 1000, expense: 200, net: 800, checkIns: 1 });
    expect(byId['b2']).toMatchObject({ totalMembers: 1, activeMembers: 0, revenue: 500, checkIns: 1 });
    expect(byId[UNASSIGNED]).toMatchObject({ totalMembers: 1, revenue: 300, branchName: 'Şubesi belirsiz' });
    expect(report.days).toBe(10);
  });

  it('adds the rows up to the totals and gives the revenue share', () => {
    const report = buildBranchReport(base);
    expect(report.totals).toMatchObject({ revenue: 1800, expense: 200, net: 1600, checkIns: 2, totalMembers: 4, capacity: 150 });
    expect(report.rows.reduce((sum, row) => sum + row.revenueShare, 0)).toBeCloseTo(100, 0);
  });

  it('gives monthly revenue per branch for the trend', () => {
    const report = buildBranchReport(base);
    expect(report.monthly).toEqual([
      { month: '2026-08', revenue: { b2: 700 } },
      { month: '2026-09', revenue: { b1: 1000, b2: 500, [UNASSIGNED]: 300 } },
    ]);
  });
});
