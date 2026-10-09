import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { ROOT_COLLECTION } from '../firebase/firestore-path';

export interface RecordErrorInput {
  requestId?: string;
  method: string;
  path: string;
  status: number;
  code: string;
  message: string;
  stack?: string;
  uid?: string;
  tenantId?: string;
  module?: string;
  clientVersion?: string;
  userAgent?: string;
}

export interface PlatformErrorLogDoc extends RecordErrorInput {
  id: string;
  createdAt: string;
}

@Injectable()
export class ErrorLogService {
  private readonly logger = new Logger(ErrorLogService.name);
  // Key: `${path}:${code}:${message}` -> timestamp ms
  private static readonly throttleMap = new Map<string, number>();
  private static readonly THROTTLE_MS = 60_000;

  constructor(private readonly firebase: FirebaseService) {}

  async record(input: RecordErrorInput): Promise<void> {
    try {
      const now = Date.now();
      const throttleKey = `${input.path}:${input.code}:${input.message.slice(0, 100)}`;
      const lastLogged = ErrorLogService.throttleMap.get(throttleKey);

      if (lastLogged && now - lastLogged < ErrorLogService.THROTTLE_MS) {
        return; // Throttled
      }
      ErrorLogService.throttleMap.set(throttleKey, now);

      // Clean old entries in map if it grows large
      if (ErrorLogService.throttleMap.size > 500) {
        for (const [key, time] of ErrorLogService.throttleMap.entries()) {
          if (now - time > ErrorLogService.THROTTLE_MS) {
            ErrorLogService.throttleMap.delete(key);
          }
        }
      }

      const ref = this.firebase.db.collection(ROOT_COLLECTION.platformErrorLogs).doc();
      const createdAt = new Date().toISOString();

      const logDoc: PlatformErrorLogDoc = {
        id: ref.id,
        requestId: input.requestId || 'unknown',
        method: input.method,
        path: input.path.split('?')[0] || input.path, // Clean query params
        status: input.status,
        code: input.code,
        message: input.message,
        stack: input.stack ? input.stack.slice(0, 4096) : undefined,
        uid: input.uid,
        tenantId: input.tenantId,
        module: input.module,
        clientVersion: input.clientVersion,
        userAgent: input.userAgent ? input.userAgent.slice(0, 500) : undefined,
        createdAt,
      };

      // Filter undefined
      const cleanDoc = Object.fromEntries(
        Object.entries(logDoc).filter(([, val]) => val !== undefined),
      );

      await ref.set(cleanDoc);
    } catch (err) {
      // Fire-and-forget: logging should not crash request handling
      this.logger.error('Failed to record platform error log', err as Error);
    }
  }

  async purgeOlderThan(days = 30): Promise<number> {
    try {
      const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const snapshot = await this.firebase.db
        .collection(ROOT_COLLECTION.platformErrorLogs)
        .where('createdAt', '<', threshold)
        .limit(200)
        .get();

      if (snapshot.empty) return 0;

      const batch = this.firebase.db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      return snapshot.docs.length;
    } catch (err) {
      this.logger.error('Failed to purge old platform error logs', err as Error);
      return 0;
    }
  }
}
