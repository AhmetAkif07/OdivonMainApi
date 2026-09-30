import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { FirebaseModule } from '../../shared/firebase/firebase.module';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { AuditModule } from '../../shared/audit/audit.module';
import { AuthorizationModule } from '../../shared/authorization/authorization.module';
import { TenancyModule } from '../../shared/tenancy/tenancy.module';
import { GymModule } from './gym.module';
import { MembersService } from './members/members.service';
import { GymReceivablesService } from './ops/receivables.service';

describe('gym module wiring', () => {
  it('lets MembersService reach the receivables service without a module import cycle', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 600 }] }),
        FirebaseModule,
        TenancyModule,
        AuthorizationModule,
        AuditModule,
        GymModule,
      ],
    })
      .overrideProvider(FirebaseService)
      .useValue({ db: {}, auth: {} })
      .compile();
    const members = moduleRef.get(MembersService);
    const receivables = (members as unknown as { receivables(): GymReceivablesService }).receivables();
    expect(receivables).toBe(moduleRef.get(GymReceivablesService));
    await moduleRef.close();
  });
});
