import { Injectable } from '@nestjs/common';
import { DocumentData, Firestore, Transaction } from 'firebase-admin/firestore';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION, TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { GymMember } from '../members/member.entity';
import { SYNC_KIND } from './access-rules';

export type AccessDoc = Record<string, unknown> & { id: string };

/**
 * Firestore access for the turnstile agent flow. Every tenant path takes the tenant id
 * explicitly: agent requests resolve it from the agent index, never from the request body.
 */
@Injectable()
export class AccessRepository {
  constructor(private readonly firebase: FirebaseService) {}

  get db(): Firestore {
    return this.firebase.db;
  }

  runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.runTransaction(fn);
  }

  private tenant(tenantId: string, name: string) {
    return this.db.collection(tenantCollectionPath(tenantId, name));
  }

  pairingCodeRef(codeHash: string) {
    return this.db.collection(ROOT_COLLECTION.gymAgentPairingCodes).doc(codeHash);
  }

  agentIndexRef(agentId: string) {
    return this.db.collection(ROOT_COLLECTION.gymAgentIndex).doc(agentId);
  }

  agents(tenantId: string) {
    return this.tenant(tenantId, TENANT_COLLECTION.gymAccessAgents);
  }

  gates(tenantId: string) {
    return this.tenant(tenantId, TENANT_COLLECTION.gymTurnstileGates);
  }

  syncDocs(tenantId: string) {
    return this.tenant(tenantId, TENANT_COLLECTION.gymDeviceCommands);
  }

  logs(tenantId: string) {
    return this.tenant(tenantId, TENANT_COLLECTION.gymAccessLogs);
  }

  members(tenantId: string) {
    return this.tenant(tenantId, TENANT_COLLECTION.gymMembers);
  }

  async listGates(tenantId: string): Promise<AccessDoc[]> {
    const snapshot = await this.gates(tenantId).get();
    return snapshot.docs.map((doc) => withId(doc.id, doc.data())).filter((gate) => !gate['deletedAt']);
  }

  async listAgents(tenantId: string): Promise<AccessDoc[]> {
    const snapshot = await this.agents(tenantId).get();
    return snapshot.docs.map((doc) => withId(doc.id, doc.data()));
  }

  /** All member documents, soft-deleted ones included (they must be removed from devices). */
  async listAllMembers(tenantId: string): Promise<GymMember[]> {
    const snapshot = await this.members(tenantId).get();
    return snapshot.docs.map((doc) => doc.data() as GymMember);
  }

  async listSyncDocs(tenantId: string): Promise<AccessDoc[]> {
    const snapshot = await this.syncDocs(tenantId).where('kind', '==', SYNC_KIND).get();
    return snapshot.docs.map((doc) => withId(doc.id, doc.data()));
  }
}

export function withId(id: string, data: DocumentData | undefined): AccessDoc {
  return { ...(data ?? {}), id };
}
