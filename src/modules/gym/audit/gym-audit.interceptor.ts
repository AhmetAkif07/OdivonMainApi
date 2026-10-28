import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';
import { AppException } from '../../../shared/errors/app.exception';
import { clientAddress } from '../../../shared/http/client-throttler.guard';
import { RequestWithTenant } from '../../../shared/tenancy/tenant.context';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { describeRoute, diff, keepsOutcome, memberIdsIn, sanitize, shouldAudit } from './gym-audit.rules';
import { GymAuditService } from './gym-audit.service';

interface AuditedRequest extends RequestWithTenant {
  method: string;
  params?: Record<string, string>;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}

function joinPath(...parts: (string | undefined)[]): string {
  return parts
    .flatMap((part) => (part ?? '').split('/'))
    .filter(Boolean)
    .join('/');
}

function idOf(value: unknown): string | null {
  const data = (value as { data?: unknown } | null)?.data ?? value;
  const record = data as { id?: unknown; uid?: unknown } | null;
  const id = record?.id ?? record?.uid;
  return typeof id === 'string' ? id : null;
}

function targetOf(body: unknown, entity: string, entityId: string | null, value: unknown): string | null {
  const record = (body ?? {}) as Record<string, unknown>;
  const fromBody = record['userId'] ?? record['memberId'];
  if (typeof fromBody === 'string' && fromBody) return fromBody;
  if (entity === 'members') return entityId ?? idOf(value);
  const data = ((value as { data?: unknown } | null)?.data ?? value) as { userId?: unknown } | null;
  return typeof data?.userId === 'string' ? data.userId : null;
}

/**
 * Writes one `gymAuditLogs` entry for every state-changing gym request made by a signed-in user:
 * who, when, from where, which route, the request (secrets masked), the field-level before/after of
 * the record it touched, and whether it succeeded. Guards run first, so rejected-by-permission calls
 * never reach the handler and are not logged here.
 */
@Injectable()
export class GymAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: GymAuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<AuditedRequest>();
    const user = request.currentUser;
    const classPath = String(Reflect.getMetadata(PATH_METADATA, context.getClass()) ?? '');
    if (!user || !classPath.startsWith('gym')) return next.handle();

    const path = joinPath(classPath, Reflect.getMetadata(PATH_METADATA, context.getHandler())).replace(/^gym\/?/, '');
    const route = { method: request.method.toUpperCase(), path };
    if (!shouldAudit(route)) return next.handle();

    const info = describeRoute(route);
    const started = Date.now();
    const paramId = request.params?.['id'] ?? request.params?.['uid'] ?? null;
    const snapshot = (id: string | null) =>
      info.collection && id ? this.audit.snapshot(user.tenantId, info.collection, id) : Promise.resolve(null);

    const memberSnapshots = async (ids: string[]) =>
      Promise.all(ids.map((id) => this.audit.snapshot(user.tenantId, TENANT_COLLECTION.gymMembers, id)));

    const record = async (
      value: unknown,
      error: unknown,
      before: Record<string, unknown> | null,
      members: { ids: string[]; before: (Record<string, unknown> | null)[] },
    ) => {
      const entityId = paramId ?? idOf(value);
      const after = error ? null : await snapshot(entityId);
      const membersAfter = error || members.ids.length === 0 ? [] : await memberSnapshots(members.ids);
      const status = error instanceof HttpException ? error.getStatus() : error ? 500 : 200;
      const isMember = user.accountType === 'gym_member';
      const targetUserId = targetOf(request.body, info.entity, entityId, value) ?? (isMember ? user.userId : null);
      const data = error ? null : ((value as { data?: unknown } | null)?.data ?? value);
      await this.audit.write({
        tenantId: user.tenantId,
        createdAt: new Date().toISOString(),
        actorId: user.userId,
        actorEmail: user.email,
        actorRole: user.role,
        actorType: isMember ? 'member' : 'staff',
        method: route.method,
        route: `${route.method} /gym/${path}`,
        entity: info.entity,
        moduleLabel: info.moduleLabel,
        verb: info.verb,
        label: info.label,
        entityId,
        targetUserId,
        memberIds: unique([targetUserId, ...members.ids, ...memberIdsIn(data)]),
        request: sanitize(request.body ?? null),
        changes: error ? null : diff(before, after),
        memberChanges: error ? null : memberDiffs(members.ids, members.before, membersAfter),
        outcome: data && keepsOutcome(route) ? sanitize(data) : null,
        result: error ? 'error' : 'success',
        statusCode: status,
        errorCode: error instanceof AppException ? error.code : error ? 'ERROR' : null,
        errorMessage: error instanceof Error ? error.message.slice(0, 300) : null,
        ip: clientAddress(request as unknown as Record<string, unknown>),
        userAgent: headerOf(request, 'user-agent'),
        durationMs: Date.now() - started,
      });
    };

    return from(snapshot(paramId)).pipe(
      mergeMap(async (before) => {
        // Members touched by a non-member route (package sale, wallet, debt payment, referral…):
        // their before/after goes to `memberChanges`, so the member's history shows e.g. the end date move.
        const ids =
          info.entity === 'members'
            ? []
            : unique([...memberIdsIn(request.body), typeof before?.['userId'] === 'string' ? before['userId'] : null]).slice(0, 3);
        return { before, members: { ids, before: await memberSnapshots(ids) } };
      }),
      mergeMap(({ before, members }) =>
        next.handle().pipe(
          mergeMap(async (value) => {
            await record(value, null, before, members);
            return value;
          }),
          catchError((error: unknown) =>
            from(record(null, error, before, members)).pipe(mergeMap(() => throwError(() => error))),
          ),
        ),
      ),
    );
  }
}

function unique(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

function memberDiffs(
  ids: string[],
  before: (Record<string, unknown> | null)[],
  after: (Record<string, unknown> | null)[],
): Record<string, Record<string, { from: unknown; to: unknown }>> | null {
  const result: Record<string, Record<string, { from: unknown; to: unknown }>> = {};
  ids.forEach((id, index) => {
    const changes = after.length ? diff(before[index] ?? null, after[index] ?? null) : null;
    if (changes) result[id] = changes;
  });
  return Object.keys(result).length > 0 ? result : null;
}

function headerOf(request: AuditedRequest, name: string): string | null {
  const value = request.headers?.[name];
  const text = Array.isArray(value) ? value[0] : value;
  return text ? text.slice(0, 300) : null;
}

