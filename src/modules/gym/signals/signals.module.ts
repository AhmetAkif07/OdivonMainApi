import { Module } from '@nestjs/common';
import { GymPresenceService } from './presence.service';
import { GymPushService } from './push.service';

/**
 * Presence and push: a leaf module (it only needs Firestore and FCM) so the turnstile, the member
 * app and the trainer app can all import it without a module cycle.
 */
@Module({
  providers: [GymPushService, GymPresenceService],
  exports: [GymPushService, GymPresenceService],
})
export class GymSignalsModule {}
