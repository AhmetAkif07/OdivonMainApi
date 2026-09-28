import { randomBytes } from 'crypto';
import {
  Body,
  Controller,
  Delete,
  Injectable,
  Logger,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { UserProfile } from '../../identity/entities/user-profile.entity';
import { IdentityRepository } from '../../identity/identity.repository';
import { TenantService } from '../../tenant/tenant.service';
import { FarmCoreService } from '../core/farm-core.service';
import { farmForbidden, farmNotFound, farmPrecondition } from '../shared/farm-errors';
import { FarmGuards } from '../shared/farm-guards';
import { FARM_ROLE_TITLES, FARM_ROLES, FarmRole } from '../shared/farm-roles';
import { FarmDoc, FarmStore } from '../shared/farm-store';

const MEMBER_NOT_FOUND = 'Üye bulunamadı.';
const LAST_ADMIN =
  'Çiftlikte en az bir Yönetici (Admin) bulunmalıdır. Son yöneticinin rolü değiştirilemez veya silinemez.';

export class InviteFarmMemberDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 120)
  displayName!: string;

  @ApiProperty({ enum: FARM_ROLES })
  @IsIn(FARM_ROLES)
  role!: FarmRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateFarmMemberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class SetFarmMemberRoleDto {
  @ApiProperty({ enum: FARM_ROLES })
  @IsIn(FARM_ROLES)
  role!: FarmRole;
}

/**
 * Farm members are MainApi users of the same tenant (`users/{uid}.tenantId`), each with a
 * member card `farmMembers/{uid}` holding the farm role. Only farm admins manage them.
 */
@Injectable()
export class FarmMembersService {
  private readonly logger = new Logger(FarmMembersService.name);

  constructor(
    private readonly store: FarmStore,
    private readonly tenantContext: TenantContext,
    private readonly users: IdentityRepository,
    private readonly core: FarmCoreService,
    private readonly tenants: TenantService,
  ) {}

  /** Creates the Auth user, MainApi profile and member card; returns a password-set link. */
  async invite(dto: InviteFarmMemberDto) {
    await this.store.assertAdmin();
    await this.assertUserLimit();
    const current = this.tenantContext.getStore();
    const email = dto.email.trim().toLowerCase();
    const displayName = dto.displayName.trim();
    let uid: string | undefined;
    let profileCreated = false;

    try {
      // Never shown to anyone — the invitee sets their own password through the reset link.
      const userRecord = await this.store.auth.createUser({
        email,
        password: randomBytes(24).toString('base64url'),
        displayName,
      });
      uid = userRecord.uid;
      const now = new Date().toISOString();
      const profile: UserProfile = {
        uid,
        tenantId: current.tenantId,
        role: 'user',
        accountType: 'staff',
        modules: current.modules,
        email,
        displayName,
        phone: dto.phone?.trim() || null,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      await this.users.createProfile(profile);
      profileCreated = true;
      await this.store.auth.setCustomUserClaims(uid, {
        tenantId: current.tenantId,
        role: 'user',
        modules: current.modules,
      });
      const member = await this.store.create(
        TENANT_COLLECTION.farmMembers,
        {
          uid,
          email,
          displayName,
          phone: dto.phone?.trim() ?? '',
          role: dto.role,
          status: 'active',
          title: dto.title?.trim() || FARM_ROLE_TITLES[dto.role],
          notes: dto.notes?.trim() ?? '',
          invitedBy: current.userId,
          addedAt: now,
        },
        uid,
      );
      const resetLink = await this.store.auth.generatePasswordResetLink(email);
      return { id: uid, member, resetLink };
    } catch (error) {
      if (uid) {
        if (profileCreated) await this.users.hardDelete(uid).catch((err) => this.logger.error(err));
        await this.store.auth.deleteUser(uid).catch((err) => this.logger.error(err));
      }
      const info = error as { code?: string; errorInfo?: { code?: string } };
      if ((info?.errorInfo?.code ?? info?.code) === 'auth/email-already-exists') {
        throw farmPrecondition(
          `"${email}" e-posta adresiyle kayıtlı bir kullanıcı zaten var. Her kullanıcı yalnızca bir işletmeye bağlı olabilir.`,
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateFarmMemberDto) {
    await this.store.assertAdmin();
    await this.activeMember(id);
    const fields = Object.fromEntries(
      Object.entries({
        displayName: dto.displayName?.trim(),
        phone: dto.phone?.trim(),
        title: dto.title?.trim(),
        notes: dto.notes?.trim(),
      }).filter(([, value]) => value !== undefined),
    );
    const member = await this.store.update(TENANT_COLLECTION.farmMembers, id, fields);
    if (fields['displayName']) {
      await this.users
        .updateProfile(id, {
          displayName: fields['displayName'] as string,
          updatedAt: new Date().toISOString(),
        })
        .catch((err) => this.logger.warn(`profile sync skipped for ${id}: ${String(err)}`));
    }
    return member;
  }

  async setRole(id: string, role: FarmRole) {
    await this.store.assertAdmin();
    const member = await this.activeMember(id);
    if (member['role'] === role) return member;
    if (id === (await this.ownerUid())) {
      throw farmForbidden('Çiftlik sahibinin rolü değiştirilemez.');
    }
    if (member['role'] === 'admin') await this.assertNotLastAdmin(id);
    return this.store.update(TENANT_COLLECTION.farmMembers, id, { role });
  }

  /** Removes the member from the farm: soft-deletes the card and disables the account. */
  async remove(id: string) {
    await this.store.assertAdmin();
    if (id === this.store.userId()) throw farmPrecondition('Kendi hesabınızı çiftlikten çıkaramazsınız.');
    if (id === (await this.ownerUid())) {
      throw farmForbidden('Çiftlik sahibi çiftlikten çıkarılamaz.');
    }
    const member = await this.activeMember(id);
    if (member['role'] === 'admin') await this.assertNotLastAdmin(id);

    await this.store.update(TENANT_COLLECTION.farmMembers, id, { status: 'passive' });
    await this.store.softDelete(TENANT_COLLECTION.farmMembers, id);
    const profile = await this.users.findByUid(id);
    if (profile && profile.tenantId === this.store.tenantId() && profile.role !== 'owner') {
      await this.users.updateProfile(id, { status: 'inactive', updatedAt: new Date().toISOString() });
      await this.store.auth.updateUser(id, { disabled: true }).catch((err) => this.logger.warn(err));
      await this.store.auth.revokeRefreshTokens(id).catch((err) => this.logger.warn(err));
    }
    return { id };
  }

  private async ownerUid(): Promise<string> {
    return (await this.tenants.getById(this.store.tenantId())).ownerUid;
  }

  private async activeMember(id: string): Promise<FarmDoc> {
    const member = await this.store.find(TENANT_COLLECTION.farmMembers, id);
    if (!member || member['deletedAt']) throw farmNotFound(MEMBER_NOT_FOUND);
    return member;
  }

  private async assertNotLastAdmin(id: string) {
    const admins = await this.store.list(TENANT_COLLECTION.farmMembers, {
      equals: { role: 'admin' },
    });
    if (admins.every((admin) => admin.id === id)) throw farmPrecondition(LAST_ADMIN);
  }

  private async assertUserLimit() {
    const subscription = (await this.core.subscription()) as { userLimit?: number } | null;
    const limit = subscription?.userLimit;
    if (!limit) return;
    const members = await this.store.list(TENANT_COLLECTION.farmMembers);
    if (members.length >= limit) {
      throw farmPrecondition(
        `Paketinizin kullanıcı limitine (${limit}) ulaştınız. Yeni kullanıcı eklemek için paketinizi yükseltin.`,
      );
    }
  }
}

@ApiTags('farm-members')
@ApiBearerAuth()
@RequireModule('farm')
@UseGuards(...FarmGuards)
@Controller('farm/members')
export class FarmMembersController {
  constructor(private readonly members: FarmMembersService) {}

  @Post()
  @ApiOperation({ summary: 'Invite a user to the farm (admin); returns a password-set link' })
  invite(@Body() dto: InviteFarmMemberDto) {
    return this.members.invite(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFarmMemberDto) {
    return this.members.update(id, dto);
  }

  @Patch(':id/role')
  setRole(@Param('id') id: string, @Body() dto: SetFarmMemberRoleDto) {
    return this.members.setRole(id, dto.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a member from the farm and disable the account (admin)' })
  remove(@Param('id') id: string) {
    return this.members.remove(id);
  }
}
