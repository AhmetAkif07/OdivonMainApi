import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from '../../shared/audit/audit.module';
import { AuthorizationModule } from '../../shared/authorization/authorization.module';
import { FirebaseModule } from '../../shared/firebase/firebase.module';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TenancyModule } from '../../shared/tenancy/tenancy.module';
import { HairBookingService } from './booking/hair-booking.service';
import { HairModule } from './hair.module';
import { HairPosService } from './pos/hair-pos.service';
import { HairReportsService } from './reports/hair-reports.service';

describe('hair module wiring', () => {
  it('resolves every hair controller and service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 600 }] }),
        FirebaseModule,
        TenancyModule,
        AuthorizationModule,
        AuditModule,
        HairModule,
      ],
    })
      .overrideProvider(FirebaseService)
      .useValue({ db: {}, auth: {} })
      .compile();
    expect(moduleRef.get(HairPosService)).toBeDefined();
    expect(moduleRef.get(HairBookingService)).toBeDefined();
    expect(moduleRef.get(HairReportsService)).toBeDefined();
    await moduleRef.close();
  });
});
