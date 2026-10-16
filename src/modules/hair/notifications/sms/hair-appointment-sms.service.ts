import { Injectable, Logger } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { TenantService } from '../../../tenant/tenant.service';
import { normalizePhone } from '../../shared/hair-phone';
import { HairDoc, HairStore } from '../../shared/hair-store';
import { str } from '../../shared/hair-tx';
import { HairSmsService } from './hair-sms.service';
import { renderSms, SmsTemplateKind } from './sms-templates';

const SMS_TYPE: Record<SmsTemplateKind, string> = {
  confirmation: 'appointmentConfirmation',
  reminder: 'appointmentReminder',
  cancellation: 'appointmentCancellation',
};

/** Appointment SMS from the tenant's templates. Best effort: never throws, returns whether it was sent. */
@Injectable()
export class HairAppointmentSmsService {
  private readonly logger = new Logger(HairAppointmentSmsService.name);

  constructor(
    private readonly store: HairStore,
    private readonly sms: HairSmsService,
    private readonly tenants: TenantService,
  ) {}

  isConfigured(): boolean {
    return this.sms.isConfigured();
  }

  async notify(appointment: HairDoc, kind: SmsTemplateKind): Promise<boolean> {
    try {
      if (!this.sms.isConfigured()) return false;
      const settings = await this.store.settings();
      const template = settings.smsTemplates[kind];
      const phone = normalizePhone(str(appointment['customerPhone']));
      if (!template?.enabled || !phone) return false;
      const result = await this.sms.send({
        to: phone,
        text: renderSms(template.text, await this.vars(appointment)),
        type: SMS_TYPE[kind],
        customerId: str(appointment['customerId']) || null,
        branchId: str(appointment['branchId']) || null,
        appointmentId: appointment.id,
      });
      return result.ok;
    } catch (error) {
      this.logger.error(`Appointment SMS ${kind} failed for ${appointment.id}`, error as Error);
      return false;
    }
  }

  private async vars(appointment: HairDoc): Promise<Record<string, string>> {
    const [tenant, branch] = await Promise.all([
      this.tenants.getById(this.store.tenantId()).catch(() => null),
      this.store.find(TENANT_COLLECTION.hairBranches, str(appointment['branchId'])),
    ]);
    const services = Array.isArray(appointment['services']) ? (appointment['services'] as HairDoc[]) : [];
    const [y, m, d] = str(appointment['date']).split('-');
    return {
      customerName: str(appointment['customerName']),
      salonName: tenant?.name ?? '',
      branchName: str(branch?.['name']),
      date: d ? `${d}.${m}.${y}` : '',
      time: str(appointment['startTime']),
      staffName: str(appointment['staffName']),
      services: services.map((s) => str(s['serviceName'])).filter(Boolean).join(', '),
    };
  }
}
