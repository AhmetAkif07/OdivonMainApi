import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../firebase/firestore-path';
import { TenantContext } from '../tenancy/tenant.context';
import { AuditEntry } from './audit.types';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      const tenantId = this.tenantContext.getTenantId();
      const userId = this.tenantContext.getUserId();
      const ref = this.firebase.db
        .collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.auditLogs))
        .doc();
      await ref.set({
        id: ref.id,
        userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        timestamp: new Date().toISOString(),
        ...(entry.changes ? { changes: entry.changes } : {}),
      });
    } catch (error) {
      this.logger.error(`Failed to write audit log for ${entry.action}`, error as Error);
    }
  }
}
