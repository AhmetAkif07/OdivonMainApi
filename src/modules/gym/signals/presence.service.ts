import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { AccessSignal, clockTr, PresenceState, reducePresence } from './presence.rules';
import { GymPushService } from './push.service';

const WRITE_CHUNK = 20;

export type PresenceDoc = PresenceState & { userId: string };

/**
 * Keeps `gymPresence/{uid}` in step with the turnstile. Called after access logs are written, from
 * a staff scan as well as from the edge agent (which has no signed-in user: the tenant id is
 * always passed in).
 */
@Injectable()
export class GymPresenceService {
  private readonly logger = new Logger(GymPresenceService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly push: GymPushService,
  ) {}

  private collection(tenantId: string) {
    return this.firebase.db.collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.gymPresence));
  }

  /**
   * Applies freshly written access events: one read and one write per member in the batch, and a
   * greeting for members who just walked in. Never throws: the turnstile must not wait on this.
   */
  async record(tenantId: string, signals: AccessSignal[], now = Date.now()): Promise<void> {
    try {
      const byUser = new Map<string, AccessSignal[]>();
      for (const signal of signals) {
        if (!signal.userId || signal.status !== 'granted') continue;
        byUser.set(signal.userId, [...(byUser.get(signal.userId) ?? []), signal]);
      }
      const users = [...byUser.keys()];
      for (let start = 0; start < users.length; start += WRITE_CHUNK) {
        await Promise.all(
          users.slice(start, start + WRITE_CHUNK).map((userId) => this.recordMember(tenantId, userId, byUser.get(userId)!, now)),
        );
      }
    } catch (error) {
      this.logger.warn(`Presence update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async recordMember(tenantId: string, userId: string, events: AccessSignal[], now: number): Promise<void> {
    const ref = this.collection(tenantId).doc(userId);
    const snapshot = await ref.get();
    const { next, welcome } = reducePresence(snapshot.exists ? (snapshot.data() as PresenceState) : null, events, now);
    if (!next) return;
    await ref.set({ ...next, id: userId, userId, tenantId, updatedAt: new Date(now).toISOString() });
    if (welcome) {
      await this.push.notifyMember(tenantId, userId, {
        type: 'check_in',
        title: 'Salona hoş geldin',
        body: `Girişin kaydedildi: ${clockTr(welcome.timestamp)} · ${welcome.gateName || 'Turnike'}. İyi antrenmanlar!`,
        data: { screen: 'check-ins' },
      });
    }
  }

  async get(tenantId: string, userId: string): Promise<PresenceDoc | null> {
    const snapshot = await this.collection(tenantId).doc(userId).get();
    return snapshot.exists ? ({ ...(snapshot.data() as PresenceState), userId }) : null;
  }

  /** Stores a presence worked out from the access log, for a member who had no document yet. */
  async save(tenantId: string, userId: string, state: PresenceState): Promise<void> {
    await this.collection(tenantId)
      .doc(userId)
      .set({ ...state, id: userId, userId, tenantId, updatedAt: new Date().toISOString() });
  }

  /** Members whose last entry is at or after `sinceIso` (a single-field range query). */
  async listEnteredSince(tenantId: string, sinceIso: string): Promise<PresenceDoc[]> {
    const snapshot = await this.collection(tenantId).where('lastInAt', '>=', sinceIso).get();
    return snapshot.docs.map((doc) => ({ ...(doc.data() as PresenceState), userId: doc.id }));
  }

  /** Presence of the given members; a member who never used the turnstile has none. */
  async getMany(tenantId: string, userIds: readonly string[]): Promise<Map<string, PresenceDoc>> {
    const found = new Map<string, PresenceDoc>();
    const unique = [...new Set(userIds.filter(Boolean))];
    for (let start = 0; start < unique.length; start += 100) {
      const refs = unique.slice(start, start + 100).map((userId) => this.collection(tenantId).doc(userId));
      const snapshots = await this.firebase.db.getAll(...refs);
      for (const snapshot of snapshots) {
        if (snapshot.exists) found.set(snapshot.id, { ...(snapshot.data() as PresenceState), userId: snapshot.id });
      }
    }
    return found;
  }
}
