import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { CLIENT_VERSION_HEADER, productFromUrl } from '../../../shared/http/client-version.guard';
import { runInBackground } from '../../../shared/http/background';
import { RequestWithTenant } from '../../../shared/tenancy/tenant.context';
import { ClientVersionTracker, moduleFromRoute } from './client-version-tracker.service';

type TrackedRequest = RequestWithTenant & {
  headers?: Record<string, string | string[] | undefined>;
  originalUrl?: string;
  url?: string;
};

/** After the tenant guard has resolved the user, notes the panel version it reported. */
@Injectable()
export class ClientVersionTrackingInterceptor implements NestInterceptor {
  constructor(private readonly tracker: ClientVersionTracker) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      try {
        this.track(context.switchToHttp().getRequest<TrackedRequest>());
      } catch {
        // Version tracking must never affect the request.
      }
    }
    return next.handle();
  }

  private track(request: TrackedRequest) {
    const user = request.currentUser;
    if (!user?.tenantId || user.accountType === 'gym_member') return;
    const raw = request.headers?.[CLIENT_VERSION_HEADER];
    const version = Array.isArray(raw) ? raw[0] : raw;
    if (!version) return;
    const module = moduleFromRoute(productFromUrl(request.originalUrl ?? request.url ?? ''), user.modules ?? []);
    if (!module) return;
    if (this.tracker.isFresh(user.tenantId, module, version.trim())) return;
    void runInBackground(
      this.tracker.record({ tenantId: user.tenantId, module, version, userId: user.userId }),
    );
  }
}
