import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { MailService } from '../../shared/mail/mail.service';

export interface ApmNotificationAppointment {
  id: string;
  tenantId: string;
  branchId: string;
  branchName: string;
  bookingSlug?: string;
  serviceName: string;
  customerName: string;
  customerEmail?: string;
  startAt: string;
  status: string;
  bookingToken?: string;
}

@Injectable()
export class ApmNotificationsService {
  private readonly logger = new Logger(ApmNotificationsService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly mail: MailService,
  ) {}

  async notifyAdmins(appointment: ApmNotificationAppointment): Promise<void> {
    await this.push(appointment.tenantId, 'admin', {
      title: 'Yeni randevu talebi',
      body: `${appointment.customerName} · ${appointment.serviceName}`,
      data: { type: 'apmAppointment', appointmentId: appointment.id, branchId: appointment.branchId },
    });
  }

  async notifyGuest(appointment: ApmNotificationAppointment, tenantName: string): Promise<void> {
    const slug = appointment.bookingSlug || appointment.branchId;
    const manageUrl = `https://apm.odivon.com/booking/${encodeURIComponent(slug)}/${encodeURIComponent(appointment.id)}${appointment.bookingToken ? `?token=${encodeURIComponent(appointment.bookingToken)}` : ''}`;
    await Promise.all([
      appointment.customerEmail
        ? this.mail.sendApmAppointmentStatus({
            to: appointment.customerEmail,
            tenantName,
            branchName: appointment.branchName,
            serviceName: appointment.serviceName,
            startAt: appointment.startAt,
            status: appointment.status,
            manageUrl,
          })
        : Promise.resolve(false),
      this.push(appointment.tenantId, 'guest', {
        title: 'Randevu durumunuz güncellendi',
        body: `${appointment.serviceName}: ${appointment.status}`,
        data: { type: 'apmGuestAppointment', appointmentId: appointment.id },
      }, appointment.id),
    ]);
  }

  private async push(
    tenantId: string,
    audience: 'admin' | 'guest',
    message: { title: string; body: string; data: Record<string, string> },
    appointmentId?: string,
  ): Promise<void> {
    const snapshot = await this.firebase.db
      .collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.apmDeviceTokens))
      .where('audience', '==', audience)
      .get();
    const tokens = snapshot.docs
      .map((doc) => doc.data())
      .filter((doc) => !doc['deletedAt'] && (!appointmentId || doc['appointmentId'] === appointmentId))
      .map((doc) => String(doc['token'] ?? ''))
      .filter(Boolean)
      .slice(0, 500);
    if (!tokens.length) return;
    try {
      await this.firebase.messaging.sendEachForMulticast({
        tokens,
        notification: { title: message.title, body: message.body },
        data: message.data,
      });
    } catch (error) {
      this.logger.warn(`APM push notification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
