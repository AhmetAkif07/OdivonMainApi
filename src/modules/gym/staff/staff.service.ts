import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { PagingQueryDto } from '../../../shared/http/paging.dto';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { IdentityRepository } from '../../identity/identity.repository';
import { UserProfile } from '../../identity/entities/user-profile.entity';
import { MailService } from '../../../shared/mail/mail.service';
import { GymInfoService } from '../info/gym-info.service';
import { CreateStaffDto, UpdateStaffDto } from './staff.dto';
import { StaffRepository } from './staff.repository';
import { GymStaff } from './staff.entity';

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly staff: StaffRepository,
    private readonly firebase: FirebaseService,
    private readonly users: IdentityRepository,
    private readonly tenantContext: TenantContext,
    private readonly mail: MailService,
    private readonly gymInfo: GymInfoService,
  ) {}

  async create(dto: CreateStaffDto) {
    const store = this.tenantContext.getStore();
    const email = dto.email.trim().toLowerCase();
    const rawPassword = dto.password?.trim();

    // 1. Parola Kontrolü: Yeni personel tanımlanırken parola boş olamaz
    if (!rawPassword) {
      throw new BadRequestException('Yeni personel tanımlamak için sisteme giriş parolası zorunludur.');
    }
    if (rawPassword.length < 6) {
      throw new BadRequestException('Sisteme giriş parolası en az 6 karakter olmalıdır.');
    }

    let authUid: string;
    let isNewAuthUser = false;

    // 2. Firebase Authentication Kullanıcısı Oluşturma / Eşleştirme
    try {
      let userRecord = await this.firebase.auth.getUserByEmail(email).catch(() => null);
      if (!userRecord) {
        userRecord = await this.firebase.auth.createUser({
          email,
          password: rawPassword,
          displayName: dto.displayName.trim(),
          emailVerified: true,
        });
        isNewAuthUser = true;
      } else {
        await this.firebase.auth.updateUser(userRecord.uid, {
          password: rawPassword,
          displayName: dto.displayName.trim(),
        });
      }

      if (!userRecord || !userRecord.uid) {
        throw new Error('Firebase Authentication kullanıcısı oluşturulamadı veya UID alınamadı.');
      }

      authUid = userRecord.uid;

      // 3. UserProfile kaydı oluştur veya güncelle
      const now = new Date().toISOString();
      const profile: UserProfile = {
        uid: authUid,
        tenantId: store.tenantId,
        role: (dto.role as any) || 'trainer',
        accountType: 'staff',
        modules: store.modules || ['gym'],
        email,
        displayName: dto.displayName.trim(),
        phone: dto.phone?.trim() || null,
        branchIds: dto.branchIds ?? (dto.branchId ? [dto.branchId] : []),
        allBranches: dto.role === 'owner' || dto.role === 'admin',
        status: dto.status === 'inactive' ? 'inactive' : 'active',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      };
      await this.users.createProfile(profile);

      // 4. Custom Claims ata
      await this.firebase.auth.setCustomUserClaims(authUid, {
        tenantId: store.tenantId,
        role: dto.role || 'trainer',
        accountType: 'staff',
        modules: store.modules || ['gym'],
      });
    } catch (err: any) {
      this.logger.error(`Personel Firebase Auth kullanıcısı oluşturulamadı (${email}): ${err?.message || err}`);
      let errorDetail = err?.message || 'Bilinmeyen bir kimlik doğrulama hatası oluştu.';
      if (err?.code === 'auth/email-already-exists') {
        errorDetail = 'Bu e-posta adresi ile kayıtlı bir kullanıcı zaten mevcut.';
      } else if (err?.code === 'auth/invalid-email') {
        errorDetail = 'Geçersiz e-posta formatı.';
      } else if (err?.code === 'auth/weak-password') {
        errorDetail = 'Belirlenen parola çok zayıf. Lütfen en az 6 karakterden oluşan güçlü bir parola belirleyin.';
      }
      // KRİTİK KURAL: Firebase Authentication oluşmadıysa kullanıcı kayıt edilmesine ASLA izin verme!
      throw new BadRequestException(`Firebase Authentication hesabı oluşturulamadığı için personel kaydedilmedi: ${errorDetail}`);
    }

    // 5. gymStaff koleksiyonuna kaydet (Yalnızca Firebase Auth başarılı olduğunda buraya gelebilir!)
    try {
      const created = await this.staff.create(dto, authUid);

      // 6. Hoş geldin & aktivasyon e-postasını gönder
      if (dto.sendWelcomeEmail !== false && created?.email) {
        this.sendStaffWelcomeSafely(created, rawPassword).catch((err) =>
          this.logger.error(`Personel karşılama e-postası gönderilemedi (${email}): ${(err as any)?.message || err}`),
        );
      }

      return created;
    } catch (dbErr: any) {
      // Eğer Firestore kaydı başarısız olursa ve Firebase kullanıcısı bu işlemde yeni oluşturulduysa geri al
      if (isNewAuthUser && authUid) {
        await this.firebase.auth.deleteUser(authUid).catch(() => null);
      }
      throw dbErr;
    }
  }

  getById(id: string) {
    return this.staff.getByIdOrThrow(id);
  }

  async list(query: PagingQueryDto) {
    const items = await this.staff.list();
    return paginateInMemory(items, query.limit ?? 100, query.cursor);
  }

  async update(id: string, dto: UpdateStaffDto) {
    const current = await this.staff.getByIdOrThrow(id);

    // Eğer şifre güncelleniyorsa Firebase Auth kullanıcısını da güncelle
    if (dto.password?.trim()) {
      const email = (dto.email || current.email).trim().toLowerCase();
      try {
        const userRecord = await this.firebase.auth.getUserByEmail(email).catch(() => null);
        if (userRecord) {
          await this.firebase.auth.updateUser(userRecord.uid, {
            password: dto.password.trim(),
          });
        }
      } catch (err: unknown) {
        this.logger.error(`Personel şifresi Firebase'de güncellenemedi (${email}): ${(err as any)?.message || err}`);
      }
    }

    return this.staff.update(id, dto);
  }

  async resendInvite(id: string) {
    const staff = await this.staff.getByIdOrThrow(id);
    if (!staff.email) {
      throw new Error('Personelin geçerli bir e-posta adresi bulunamadı.');
    }
    await this.sendStaffWelcomeSafely(staff);
    return { success: true, message: 'Giriş ve şifre belirleme davet e-postası başarıyla gönderildi.' };
  }

  async remove(id: string) {
    const staff = await this.staff.getByIdOrThrow(id);
    await this.staff.softDelete(id);
    if (staff.userId) {
      await this.firebase.auth.updateUser(staff.userId, { disabled: true }).catch(() => null);
    }
    return { id };
  }

  private async sendStaffWelcomeSafely(staff: GymStaff, rawPassword?: string) {
    try {
      const gymInfo = await this.gymInfo.get().catch(() => null);
      const tenantName = gymInfo?.businessName || 'Spor Salonu';
      const appUrl = process.env.APP_URL_GYM || process.env.APP_URL || 'https://gym.odivon.com';

      const resetLink = await this.firebase.auth
        .generatePasswordResetLink(staff.email, {
          url: `${appUrl.replace(/\/+$/, '')}/auth/login`,
        })
        .catch(() => null);

      await this.mail.sendGymStaffWelcomeEmail({
        to: staff.email,
        displayName: staff.displayName,
        tenantName,
        roleTitle: staff.title || staff.role,
        password: rawPassword,
        resetLink,
        loginUrl: `${appUrl.replace(/\/+$/, '')}/auth/login`,
      });
    } catch (err) {
      this.logger.error(`Staff welcome email error (${staff.email}): ${(err as any)?.message || err}`);
    }
  }
}
