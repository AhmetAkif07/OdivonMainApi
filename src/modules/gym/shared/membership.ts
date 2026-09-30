import { GymMember } from '../members/member.entity';
import { GymPackage } from '../packages/package.entity';

/**
 * Activates `pkg` on the member. A still-running active membership is extended from its end date,
 * otherwise the new period starts now. `price` is what was actually charged (after discount).
 */
export function applyPackage(member: GymMember, pkg: GymPackage, price: number, now = new Date()): GymMember {
  let base = now;
  if (member.membershipStatus === 'active' && member.membershipEndsAt) {
    const currentEnd = new Date(member.membershipEndsAt);
    if (currentEnd.getTime() > now.getTime()) {
      base = currentEnd;
    }
  }
  const ends = new Date(base.getTime());
  ends.setDate(ends.getDate() + Number(pkg.durationDays ?? 30));
  return {
    ...member,
    membershipStatus: 'active',
    packageLabel: pkg.name,
    packagePrice: price,
    membershipStartsAt: now.toISOString(),
    membershipEndsAt: ends.toISOString(),
  };
}
