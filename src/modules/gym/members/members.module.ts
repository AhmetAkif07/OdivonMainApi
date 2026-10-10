import { MailModule } from '../../../shared/mail/mail.module';
import { TenantModule } from '../../tenant/tenant.module';
import { GymMailTemplateModule } from '../mail-template/gym-mail-template.module';
import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { GymAccessModule } from '../access/access.module';
import { MembersController } from './members.controller';
import { MembersRepository } from './members.repository';
import { MembersService } from './members.service';

@Module({
  imports: [IdentityModule, GymAccessModule, MailModule, TenantModule, GymMailTemplateModule],
  controllers: [MembersController],
  providers: [MembersRepository, MembersService],
  exports: [MembersRepository, MembersService],
})
export class GymMembersModule {}
