import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { productFromUrl } from '../../../shared/http/client-version.guard';
import { TRAFFIC_TAG_HEADER } from '../../../shared/http/traffic-metrics';
import { RequestWithTenant } from '../../../shared/tenancy/tenant.context';
import { moduleFromRoute } from '../releases/client-version-tracker.service';

type TaggedRequest = RequestWithTenant & { originalUrl?: string; url?: string };
type TaggedResponse = { setHeader?: (name: string, value: string) => void; headersSent?: boolean };

/**
 * After the tenant guard resolved the user, tells the Worker which tenant and product a request
 * belongs to (internal header, stripped by recordTraffic before the response leaves the Worker).
 */
@Injectable()
export class TrafficTagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      try {
        const http = context.switchToHttp();
        const request = http.getRequest<TaggedRequest>();
        const response = http.getResponse<TaggedResponse>();
        const tag = trafficTag(request);
        if (tag && !response.headersSent) response.setHeader?.(TRAFFIC_TAG_HEADER, tag);
      } catch {
        // Traffic tagging must never affect the request.
      }
    }
    return next.handle();
  }
}

export function trafficTag(request: TaggedRequest): string | null {
  const user = request.currentUser;
  if (!user?.tenantId) return null;
  const segment = productFromUrl(request.originalUrl ?? request.url ?? '');
  const module = moduleFromRoute(segment, user.modules ?? []) ?? '';
  return `${user.tenantId.replace(/\|/g, '')}|${module}`;
}
