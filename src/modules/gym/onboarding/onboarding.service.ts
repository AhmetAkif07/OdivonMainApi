import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { TenantService } from '../../tenant/tenant.service';
import { BranchesRepository } from '../branches/branches.repository';
import { GymInfoService } from '../info/gym-info.service';
import { PackagesRepository } from '../packages/packages.repository';
import { gymCollection, listUndeleted } from '../shared/gym-collection';
import { StaffRepository } from '../staff/staff.repository';
import { CompleteOnboardingDto } from './onboarding.dto';
import { GymBranch } from '../branches/branch.entity';

@Injectable()
export class GymOnboardingService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly tenants: TenantService,
    private readonly info: GymInfoService,
    private readonly branches: BranchesRepository,
    private readonly staff: StaffRepository,
    private readonly packages: PackagesRepository,
  ) {}

  async ensureDefaults(): Promise<void> {
    const existing = await this.branches.list();
    if (existing.length > 0) {
      return;
    }
    const tenant = await this.tenants.getById(this.tenantContext.getTenantId());
    await this.branches.create({
      name: `${tenant.name} - Merkez Şube`,
      address: 'Merkez',
      city: 'İstanbul',
      phone: '',
      email: '',
      capacity: 250,
      features: [],
      openDays: [1, 2, 3, 4, 5, 6, 0],
      openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        day,
        open: '06:30',
        close: '23:30',
        closed: false,
      })),
    });
    const defaultPackages = [
      { name: '1 Aylık Standart', durationDays: 30, price: 1500, features: ['Fitness'], trialEligible: false, maxFreeze: 0 },
      { name: '3 Aylık Fit Paket', durationDays: 90, price: 3800, features: ['Fitness', 'Grup dersleri'], trialEligible: true, maxFreeze: 15 },
      { name: '1 Yıllık VIP Gold', durationDays: 365, price: 11900, features: ['Tüm alanlar'], trialEligible: false, maxFreeze: 60 },
    ];
    for (const pkg of defaultPackages) {
      await this.packages.create(pkg);
    }
  }

  async complete(dto: CompleteOnboardingDto) {
    const gym = dto.gym;
    await this.info.upsert({
      businessName: gym.name,
      businessPhone: gym.phone,
      city: gym.city,
      address: gym.address,
      openTime: gym.openTime,
      closeTime: gym.closeTime,
      workingDays: gym.workingDays,
      logo: gym.logoUrl ?? null,
      features: gym.features ?? [],
    });

    const existingBranches = await this.branches.list();
    let branch: GymBranch;
    if (existingBranches[0]) {
      branch = await this.branches.update(existingBranches[0].id, {
        name: dto.branch.branchName,
        capacity: dto.branch.capacity,
        phone: dto.branch.branchPhone,
        address: dto.branch.branchAddress,
        city: gym.city,
        logoUrl: gym.logoUrl ?? null,
        openDays: gym.workingDays,
        features: gym.features ?? [],
        openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
          day,
          open: gym.openTime,
          close: gym.closeTime,
          closed: !gym.workingDays.includes(day),
        })),
      });
    } else {
      branch = await this.branches.create({
        name: dto.branch.branchName,
        capacity: dto.branch.capacity,
        phone: dto.branch.branchPhone,
        address: dto.branch.branchAddress,
        city: gym.city,
        logoUrl: gym.logoUrl ?? null,
        openDays: gym.workingDays,
        features: gym.features ?? [],
        openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
          day,
          open: gym.openTime,
          close: gym.closeTime,
          closed: !gym.workingDays.includes(day),
        })),
      });
    }

    await this.staff.create({
      displayName: dto.trainer.displayName,
      email: dto.trainer.email,
      phone: dto.trainer.phone,
      role: 'trainer',
      title: 'Baş Antrenör / PT',
      specialties: (dto.trainer.specialties ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      branchId: branch.id,
      branchName: branch.name,
      notes: dto.trainer.notes ?? null,
      commissionRate: 15,
    });

    if (dto.seedDefaultPackages !== false) {
      const packages = await this.packages.list({});
      if (packages.length === 0) {
        await this.packages.create({
          name: '1 Aylık Standart Üyelik',
          durationDays: 30,
          price: dto.package1Price ?? 1250,
          features: ['Fitness Alanı', 'Soyunma Odası & Duş'],
        });
        await this.packages.create({
          name: '3 Aylık Avantajlı Paket',
          durationDays: 90,
          price: dto.package3Price ?? 3200,
          features: ['Fitness Alanı', 'Mobil Turnike QR'],
        });
        await this.packages.create({
          name: '1 Yıllık VIP Sınırsız',
          durationDays: 365,
          price: dto.package12Price ?? 9900,
          features: ['Tüm Şubelerde Geçerli', 'VIP Dolap'],
        });
      }
    }

    if (dto.seedDisciplines !== false) {
      await this.seedIfEmpty(TENANT_COLLECTION.gymDisciplines, [
        { name: 'Fitness & Vücut Geliştirme', code: 'FIT' },
        { name: 'Kickboks & Boks', code: 'BOX' },
        { name: 'Reformer Pilates', code: 'PIL' },
      ]);
    }

    if (dto.seedWorkoutTemplates) {
      await this.seedIfEmpty(TENANT_COLLECTION.gymWorkoutTemplates, [
        { name: 'Başlangıç Full Body', level: 'beginner' },
      ]);
    }

    await this.tenants.update(this.tenantContext.getTenantId(), {
      onboardingCompleted: true,
      name: gym.name,
      logoUrl: gym.logoUrl ?? null,
    });

    return { completed: true };
  }

  private async seedIfEmpty(collection: string, items: Record<string, unknown>[]) {
    const col = gymCollection(this.firebase, this.tenantContext, collection);
    const existing = await listUndeleted(col);
    if (existing.length > 0) {
      return;
    }
    for (const item of items) {
      const ref = col.doc();
      await ref.set({
        ...createBaseFields(ref.id, this.tenantContext.getUserId()),
        ...item,
      });
    }
  }
}
