import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { AppCheck, getAppCheck } from 'firebase-admin/app-check';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { Messaging, getMessaging } from 'firebase-admin/messaging';
import { loadConfiguration } from '../../config/configuration';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app!: App;
  private authClient!: Auth;
  private firestoreClient?: Firestore;

  onModuleInit(): void {
    const config = loadConfiguration();
    const existing = getApps()[0];
    if (existing) {
      this.app = existing;
    } else {
      const credential =
        config.firebase.clientEmail && config.firebase.privateKey
          ? cert({
              projectId: config.firebase.projectId,
              clientEmail: config.firebase.clientEmail,
              privateKey: config.firebase.privateKey,
            })
          : undefined;

      this.app = initializeApp({
        projectId: config.firebase.projectId,
        ...(credential ? { credential } : {}),
      });
    }

    if (config.firebase.firestoreEmulatorHost) {
      process.env.FIRESTORE_EMULATOR_HOST = config.firebase.firestoreEmulatorHost;
      this.logger.log(`Using Firestore emulator at ${config.firebase.firestoreEmulatorHost}`);
    }
    if (config.firebase.authEmulatorHost) {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = config.firebase.authEmulatorHost;
      this.logger.log(`Using Auth emulator at ${config.firebase.authEmulatorHost}`);
    }

    this.authClient = getAuth(this.app);
  }

  get auth(): Auth {
    return this.authClient;
  }

  get appCheck(): AppCheck {
    return getAppCheck(this.app);
  }

  get messaging(): Messaging {
    return getMessaging(this.app);
  }

  get db(): Firestore {
    // Workers permits the random bytes used by Firestore only inside a request.
    return (this.firestoreClient ??= getFirestore(this.app));
  }
}
