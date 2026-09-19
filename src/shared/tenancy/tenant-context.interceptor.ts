import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { RequestWithTenant, TenantContext } from './tenant.context';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    const store = request.currentUser;
    if (!store) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      let teardown: (() => void) | undefined;
      this.tenantContext.run(store, () => {
        const subscription = next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
        teardown = () => subscription.unsubscribe();
      });
      return () => teardown?.();
    });
  }
}
