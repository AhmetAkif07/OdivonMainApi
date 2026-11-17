import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { createBaseFields } from '../../../shared/firestore/base-document';
import { runInBackground } from '../../../shared/http/background';

export type PushAudience = 'member' | 'staff';

export interface PushMessage {
  /** Machine name of the event (`check_in`, `new_program`, `request_new`…); the app routes on it. */
  type: string;
  title: string;
  body: string;
  /** Where a tap should lead; FCM only carries strings. */
  data?: Record<string, string>;
  /** Shown on the loud channel (a member is waiting on the gym floor). */
  urgent?: boolean;
}

export interface RegisterDeviceInput {
  token: string;
  platform?: string;
  appVersion?: string;
}

/** Android notification channels created by the app; the ids must match on both sides. */
export const PUSH_CHANNEL = { updates: 'gym-updates', urgent: 'gym-urgent' } as const;

/** FCM answers these for a token that will never work again. */
const DEAD_TOKEN_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);
const MAX_TOKENS = 500;

interface Device {
  id: string;
  token: string;
  userId: string;
}

/**
 * Push notifications of the gym apps (members and trainers), sent through FCM.
 * Every method takes the tenant id explicitly: turnstile events arrive without a signed-in user.
 * Sending never fails or slows the request that caused it.
 */
@Injectable()
export class GymPushService {
  private readonly logger = new Logger(GymPushService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private collection(tenantId: string, name: string) {
    return this.firebase.db.collection(tenantCollectionPath(tenantId, name));
  }

  /** One document per device token; signing in as someone else on the same phone moves the token. */
  async registerDevice(tenantId: string, userId: string, audience: PushAudience, input: RegisterDeviceInput) {
    const id = tokenId(input.token);
    await this.collection(tenantId, TENANT_COLLECTION.gymPushDevices)
      .doc(id)
      .set({
        ...createBaseFields(id, userId),
        tenantId,
        userId,
        audience,
        token: input.token,
        platform: input.platform ?? 'android',
        appVersion: input.appVersion ?? null,
      });
    return { registered: true as const };
  }

  /** Only the owner of a token can remove it (sign-out). */
  async unregisterDevice(tenantId: string, userId: string, token: string) {
    const ref = this.collection(tenantId, TENANT_COLLECTION.gymPushDevices).doc(tokenId(token));
    const snapshot = await ref.get();
    if (snapshot.exists && snapshot.data()?.['userId'] === userId) {
      await ref.delete();
    }
    return { registered: false as const };
  }

  /**
   * Tells one member something: a row in their in-app notification list (awaited, so it is there
   * when the app refreshes) and a push to their phones (in the background).
   */
  async notifyMember(tenantId: string, userId: string, message: PushMessage, options: { inApp?: boolean } = {}): Promise<void> {
    try {
      if (options.inApp !== false) {
        const ref = this.collection(tenantId, TENANT_COLLECTION.gymMemberNotifications).doc();
        await ref.set({
          ...createBaseFields(ref.id, 'system'),
          tenantId,
          userId,
          type: message.type,
          title: message.title,
          body: message.body,
          data: message.data ?? {},
          readAt: null,
        });
      }
    } catch (error) {
      this.logger.warn(`Member notification was not stored: ${describe(error)}`);
    }
    void runInBackground(this.sendTo(tenantId, 'userId', userId, null, message));
  }

  /** Pushes to trainers' phones: the given users, or every signed-in staff device when `userIds` is null. */
  notifyStaff(tenantId: string, userIds: readonly string[] | null, message: PushMessage): void {
    if (userIds && userIds.length === 0) return;
    void runInBackground(this.sendTo(tenantId, 'audience', 'staff', userIds, message));
  }

  private async sendTo(
    tenantId: string,
    field: 'userId' | 'audience',
    value: string,
    onlyUsers: readonly string[] | null,
    message: PushMessage,
  ): Promise<void> {
    try {
      const devices = this.collection(tenantId, TENANT_COLLECTION.gymPushDevices);
      const snapshot = await devices.where(field, '==', value).get();
      const targets: Device[] = snapshot.docs
        .map((doc) => ({ id: doc.id, token: String(doc.data()['token'] ?? ''), userId: String(doc.data()['userId'] ?? '') }))
        .filter((device) => device.token && (!onlyUsers || onlyUsers.includes(device.userId)))
        .slice(0, MAX_TOKENS);
      if (!targets.length) return;
      const response = await this.firebase.messaging.sendEachForMulticast({
        tokens: targets.map((device) => device.token),
        notification: { title: message.title, body: message.body },
        data: { ...stringValues(message.data), type: message.type },
        android: {
          priority: message.urgent ? 'high' : 'normal',
          notification: { channelId: message.urgent ? PUSH_CHANNEL.urgent : PUSH_CHANNEL.updates },
        },
      });
      const dead = response.responses
        .map((result, index) => (!result.success && DEAD_TOKEN_CODES.has(result.error?.code ?? '') ? targets[index] : null))
        .filter((device): device is Device => device !== null);
      await Promise.all(dead.map((device) => devices.doc(device.id).delete()));
    } catch (error) {
      this.logger.warn(`Gym push (${message.type}) failed: ${describe(error)}`);
    }
  }
}

export function tokenId(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function stringValues(data: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(data ?? {}).map(([key, value]) => [key, String(value)]));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
