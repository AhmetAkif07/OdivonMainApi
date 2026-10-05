import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted } from '../../../shared/firestore/base-document';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { CreateCommunicationLogDto } from './dto/create-communication-log.dto';
import { ListCommunicationLogsQueryDto } from './dto/list-communication-logs.query.dto';
import { CommunicationLog } from './entities/communication-log.entity';
import { PetVetExportRecord, PetVetSummary } from './entities/petvet-compliance.entity';

@Injectable()
export class CrmRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private logsCollection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.communicationLogs),
    );
  }

  private patientsCollection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.patients),
    );
  }

  private customersCollection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.customers),
    );
  }

  private vaccineSchedulesCollection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.vaccineSchedules),
    );
  }

  private appointmentsCollection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.appointments),
    );
  }

  async listLogs(query: ListCommunicationLogsQueryDto) {
    const snapshot = await this.logsCollection().get();
    let items = snapshot.docs
      .map((doc) => doc.data() as CommunicationLog)
      .filter((item) => !isDeleted(item));

    if (query.channel) items = items.filter((i) => i.channel === query.channel);
    if (query.category) items = items.filter((i) => i.category === query.category);
    if (query.patientId) items = items.filter((i) => i.patientId === query.patientId);

    if (query.q) {
      const q = query.q.trim().toLowerCase();
      items = items.filter(
        (i) =>
          i.recipientName.toLowerCase().includes(q) ||
          i.recipientPhone.includes(q) ||
          (i.patientName && i.patientName.toLowerCase().includes(q)) ||
          i.messageContent.toLowerCase().includes(q),
      );
    }

    items.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
    return paginateInMemory(items, query.limit, query.cursor);
  }

  async createLog(dto: CreateCommunicationLogDto): Promise<CommunicationLog> {
    const ref = this.logsCollection().doc();
    const now = new Date().toISOString();
    const log: CommunicationLog = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      channel: dto.channel,
      category: dto.category,
      recipientPhone: dto.recipientPhone,
      recipientName: dto.recipientName,
      patientId: dto.patientId ?? null,
      patientName: dto.patientName ?? null,
      messageContent: dto.messageContent,
      status: dto.status ?? 'sent',
      sentAt: now,
    };

    await ref.set(log);
    return log;
  }

  async getReminderCandidates() {
    const now = new Date();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];
    const tomorrowStr = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [vaccinesSnap, appointmentsSnap, customersSnap] = await Promise.all([
      this.vaccineSchedulesCollection().get(),
      this.appointmentsCollection().get(),
      this.customersCollection().get(),
    ]);

    const customersMap = new Map<string, any>();
    customersSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (!isDeleted(data)) customersMap.set(data.id, data);
    });

    // 1. Vaccine reminders
    const vaccineCandidates: any[] = [];
    vaccinesSnap.docs.forEach((doc) => {
      const v = doc.data();
      if (isDeleted(v) || v.done) return;
      const dueDate = (v.dueAt || '').split('T')[0];
      const customer = customersMap.get(v.customerId);
      const isOverdue = dueDate < todayStr;
      const isUpcoming = dueDate >= todayStr && dueDate <= next7Days;

      if (isOverdue || isUpcoming) {
        vaccineCandidates.push({
          id: v.id,
          type: 'vaccine',
          patientId: v.patientId,
          patientName: v.patientName ?? 'Hasta',
          customerId: v.customerId,
          customerName: customer ? `${customer.firstName} ${customer.lastName}` : (v.customerName ?? 'Hasta Sahibi'),
          customerPhone: customer?.phone ?? '',
          vaccineName: v.vaccineName,
          dueAt: v.dueAt,
          isOverdue,
          suggestedMessage: `Sayın ${customer ? customer.firstName : 'Hasta Sahibi'}, minik dostumuz ${v.patientName ?? ''}'nin ${v.vaccineName} aşı zamanı ${isOverdue ? 'geçmiştir' : 'yaklaşmıştır'} (${dueDate}). Randevu oluşturmak için kliniğimizle iletişime geçebilirsiniz. Sağlıklı günler dileriz.`,
        });
      }
    });

    // 2. Appointment reminders
    const appointmentCandidates: any[] = [];
    appointmentsSnap.docs.forEach((doc) => {
      const a = doc.data();
      if (isDeleted(a) || a.status === 'completed' || a.status === 'cancelled') return;
      const apptDate = (a.startsAt || a.startAt || '').split('T')[0];
      const customer = customersMap.get(a.customerId);

      if (apptDate === todayStr || apptDate === tomorrowStr) {
        const timeStr = (a.startsAt || a.startAt || '').split('T')[1]?.substring(0, 5) || '';
        appointmentCandidates.push({
          id: a.id,
          type: 'appointment',
          patientId: a.patientId,
          patientName: a.patientName ?? 'Hasta',
          customerId: a.customerId,
          customerName: customer ? `${customer.firstName} ${customer.lastName}` : (a.customerName ?? 'Hasta Sahibi'),
          customerPhone: customer?.phone ?? '',
          startsAt: a.startsAt || a.startAt,
          isToday: apptDate === todayStr,
          suggestedMessage: `Sayın ${customer ? customer.firstName : 'Hasta Sahibi'}, ${a.patientName ?? 'hastanız'} için ${apptDate === todayStr ? 'bugün' : 'yarın'} saat ${timeStr}'de randevunuz bulunmaktadır. Randevu saatinde kliniğimizde olmanızı rica ederiz.`,
        });
      }
    });

    return {
      vaccineReminders: vaccineCandidates,
      appointmentReminders: appointmentCandidates,
      totalCandidates: vaccineCandidates.length + appointmentCandidates.length,
    };
  }

  async getPetVetSummary(): Promise<PetVetSummary> {
    const [patientsSnap, customersSnap, vaccinesSnap] = await Promise.all([
      this.patientsCollection().get(),
      this.customersCollection().get(),
      this.vaccineSchedulesCollection().get(),
    ]);

    const customersMap = new Map<string, any>();
    customersSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (!isDeleted(data)) customersMap.set(data.id, data);
    });

    const rabiesMap = new Map<string, any>();
    vaccinesSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (!isDeleted(data) && data.done && (data.vaccineName || '').toLowerCase().includes('kuduz')) {
        const existing = rabiesMap.get(data.patientId);
        if (!existing || new Date(data.doneAt).getTime() > new Date(existing.doneAt).getTime()) {
          rabiesMap.set(data.patientId, data);
        }
      }
    });

    const patients = patientsSnap.docs
      .map((d) => d.data())
      .filter((p) => !isDeleted(p));

    let chippedCount = 0;
    let missingCustomerNationalIdCount = 0;
    let rabiesVaccinatedCount = 0;
    let rabiesExpiringCount = 0;
    const nonCompliantPatients: any[] = [];

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    for (const p of patients) {
      const chip = (p.chipNumber || '').trim();
      const isChipped = chip.length === 15 && /^\d{15}$/.test(chip);
      if (isChipped) chippedCount++;

      const customer = customersMap.get(p.customerId);
      const hasNationalId = customer?.nationalId && customer.nationalId.trim().length >= 10;
      if (!hasNationalId) missingCustomerNationalIdCount++;

      const rabies = rabiesMap.get(p.id);
      if (rabies && rabies.doneAt) {
        const rabiesDate = new Date(rabies.doneAt);
        if (rabiesDate >= oneYearAgo) {
          rabiesVaccinatedCount++;
        }
      }

      if (!isChipped || !hasNationalId) {
        const issues: string[] = [];
        if (!isChipped) issues.push(chip ? 'Geçersiz çip (15 hane olmalı)' : 'Mikroçip kaydı yok');
        if (!hasNationalId) issues.push('Sahip T.C. Kimlik No eksik');

        nonCompliantPatients.push({
          patientId: p.id,
          patientName: p.name,
          animalType: p.animalType || 'Kedi/Köpek',
          breed: p.breed ?? null,
          chipNumber: p.chipNumber ?? null,
          customerId: p.customerId,
          customerName: customer ? `${customer.firstName} ${customer.lastName}` : 'Bilinmeyen Müşteri',
          customerPhone: customer?.phone ?? '',
          issue: issues.join(', '),
        });
      }
    }

    const total = patients.length;
    const chipComplianceRate = total > 0 ? Math.round((chippedCount / total) * 100) : 0;

    return {
      totalPatients: total,
      chippedPatients: chippedCount,
      unchippedPatients: total - chippedCount,
      chipComplianceRate,
      missingCustomerNationalIdCount,
      rabiesVaccinatedCount,
      rabiesExpiringCount,
      nonCompliantPatients,
    };
  }

  async getPetVetExportData(): Promise<PetVetExportRecord[]> {
    const [patientsSnap, customersSnap, vaccinesSnap] = await Promise.all([
      this.patientsCollection().get(),
      this.customersCollection().get(),
      this.vaccineSchedulesCollection().get(),
    ]);

    const customersMap = new Map<string, any>();
    customersSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (!isDeleted(data)) customersMap.set(data.id, data);
    });

    const rabiesMap = new Map<string, any>();
    vaccinesSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (!isDeleted(data) && data.done && (data.vaccineName || '').toLowerCase().includes('kuduz')) {
        const existing = rabiesMap.get(data.patientId);
        if (!existing || new Date(data.doneAt).getTime() > new Date(existing.doneAt).getTime()) {
          rabiesMap.set(data.patientId, data);
        }
      }
    });

    const patients = patientsSnap.docs
      .map((d) => d.data())
      .filter((p) => !isDeleted(p));

    return patients.map((p) => {
      const customer = customersMap.get(p.customerId);
      const rabies = rabiesMap.get(p.id);
      return {
        patientId: p.id,
        patientName: p.name,
        animalType: p.animalType || '',
        breed: p.breed || '',
        chipNumber: p.chipNumber || '',
        passportNumber: p.passportNumber || '',
        birthDate: p.birthDate || '',
        sex: p.sex || '',
        color: p.color || '',
        sterilization: Boolean(p.sterilization),
        customerId: p.customerId,
        customerName: customer ? `${customer.firstName} ${customer.lastName}` : '',
        customerPhone: customer?.phone || '',
        customerNationalId: customer?.nationalId || '',
        customerAddress: customer?.address || '',
        rabiesVaccineDate: rabies?.doneAt || null,
        rabiesVaccineLot: rabies?.lotNumber || null,
      };
    });
  }
}
