import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { GymAuditController } from './gym-audit.controller';
import { GymAuditInterceptor } from './gym-audit.interceptor';
import { GymAuditService } from './gym-audit.service';

@Module({
  controllers: [GymAuditController],
  providers: [GymAuditService, { provide: APP_INTERCEPTOR, useClass: GymAuditInterceptor }],
  exports: [GymAuditService],
})
export class GymAuditModule {}
