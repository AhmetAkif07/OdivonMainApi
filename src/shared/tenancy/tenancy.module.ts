import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantAlsMiddleware } from './tenant-als.middleware';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { TenantContext } from './tenant.context';
import { TenantGuard } from './tenant.guard';

@Global()
@Module({
  providers: [
    TenantContext,
    TenantGuard,
    TenantAlsMiddleware,
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
  exports: [TenantContext, TenantGuard],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantAlsMiddleware).forRoutes('*');
  }
}
