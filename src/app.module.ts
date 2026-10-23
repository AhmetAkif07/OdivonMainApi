import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClientThrottlerGuard } from './shared/http/client-throttler.guard';
import { ClientVersionGuard } from './shared/http/client-version.guard';
import { ValidationPipe } from '@nestjs/common';
import { AuditModule } from './shared/audit/audit.module';
import { AuthorizationModule } from './shared/authorization/authorization.module';
import { FirebaseModule } from './shared/firebase/firebase.module';
import { GlobalExceptionFilter } from './shared/errors/global-exception.filter';
import { HealthModule } from './shared/health/health.module';
import { ResponseInterceptor } from './shared/http/response.interceptor';
import { LoggerModule } from './shared/logger/logger.module';
import { TenancyModule } from './shared/tenancy/tenancy.module';
import { IdentityModule } from './modules/identity/identity.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { VetModule } from './modules/vet/vet.module';
import { FarmModule } from './modules/farm/farm.module';
import { GymModule } from './modules/gym/gym.module';
import { SpaModule } from './modules/spa/spa.module';
import { HairModule } from './modules/hair/hair.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ApmModule } from './modules/apm/apm.module';
import { PlatformModule } from './modules/platform/platform.module';
import { BeautyModule } from './modules/beauty/beauty.module';
import { RentacarModule } from './modules/rentacar/rentacar.module';
import { DrivingSchoolModule } from './modules/driving-school/driving-school.module';
import { ParkingModule } from './modules/parking/parking.module';
import { FireSafeModule } from './modules/fire-safe/fire-safe.module';

@Module({
  imports: [
    LoggerModule,
    FirebaseModule,
    TenancyModule,
    AuthorizationModule,
    AuditModule,
    HealthModule,
    TenantModule,
    IdentityModule,
    VetModule,
    FarmModule,
    GymModule,
    SpaModule,
    HairModule,
    BeautyModule,
    RentacarModule,
    DrivingSchoolModule,
    ParkingModule,
    FireSafeModule,
    PaymentsModule,
    ApmModule,
    PlatformModule,
    ThrottlerModule.forRoot({
      // Per client IP: a front desk behind one NAT runs several panels plus the edge agent.
      throttlers: [{ ttl: 60_000, limit: 1200 }],
    }),
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_GUARD, useClass: ClientVersionGuard },
    ...(process.env.NODE_ENV === 'production'
      ? [{ provide: APP_GUARD, useClass: ClientThrottlerGuard }]
      : []),
  ],
})
export class AppModule {}
