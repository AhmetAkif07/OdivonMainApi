import { randomUUID } from 'crypto';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import { PaginatedResult } from './paginated.result';

export function resolveRequestId(request: Request & { id?: string }): string {
  const header = request.header('x-request-id');
  if (header && header.trim().length > 0) {
    return header.trim();
  }
  if (request.id) {
    return request.id;
  }
  const generated = randomUUID();
  request.id = generated;
  return generated;
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { id?: string }>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = resolveRequestId(request);
    response.setHeader('x-request-id', requestId);

    if (request.path === '/health') {
      return next.handle();
    }

    return next.handle().pipe(
      map((data: unknown) => {
        if (data instanceof PaginatedResult) {
          return {
            success: true,
            data: data.items,
            meta: {
              requestId,
              limit: data.limit,
              nextCursor: data.nextCursor,
            },
          };
        }
        return {
          success: true,
          data,
          meta: { requestId },
        };
      }),
    );
  }
}
