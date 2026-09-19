import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
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
    ...(process.env.NODE_ENV === 'production'
      ? [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
      : []),
  ],
})
export class AppModule {}
