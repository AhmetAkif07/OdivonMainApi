import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from '../../shared/audit/audit.module';
import { AuditService } from '../../shared/audit/audit.service';
import { AuthorizationModule } from '../../shared/authorization/authorization.module';
import { FirebaseModule } from '../../shared/firebase/firebase.module';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TenancyModule } from '../../shared/tenancy/tenancy.module';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { ClinicPagesRepository } from './paging/paging.service';
import { CommissionRulesRepository } from './staff/commissions/commissions.service';
import { StaffLeavesRepository, StaffShiftsRepository } from './staff/staff.repository';
import { SurgeriesRepository } from './surgeries/surgeries.service';
import { VetModule } from './vet.module';

/**
 * Stores that extend an undecorated base class must still get their constructor arguments.
 * Unit tests build services by hand, so only real module wiring catches a missing injection.
 */
describe('vet store wiring', () => {
  it.each([
    ['ClinicPagesRepository', ClinicPagesRepository],
    ['SurgeriesRepository', SurgeriesRepository],
    ['CommissionRulesRepository', CommissionRulesRepository],
    ['StaffShiftsRepository', StaffShiftsRepository],
    ['StaffLeavesRepository', StaffLeavesRepository],
  ])('injects Firebase, tenant context and audit into %s', async (_name, token) => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 600 }] }),
        FirebaseModule,
        TenancyModule,
        AuthorizationModule,
        AuditModule,
        VetModule,
      ],
    })
      .overrideProvider(FirebaseService)
      .useValue({ db: {}, auth: {} })
      .compile();
    const store = moduleRef.get(token, { strict: false }) as unknown as Record<string, unknown>;
    const values = Object.values(store);
    expect(values).toContain(moduleRef.get(FirebaseService));
    expect(values.some((value) => value instanceof TenantContext)).toBe(true);
    expect(values.some((value) => value instanceof AuditService)).toBe(true);
    await moduleRef.close();
  }, 30_000);
});
