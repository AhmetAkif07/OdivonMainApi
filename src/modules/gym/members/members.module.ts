import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { MembersController } from './members.controller';
import { MembersRepository } from './members.repository';
import { MembersService } from './members.service';

@Module({
  imports: [IdentityModule],
  controllers: [MembersController],
  providers: [MembersRepository, MembersService],
  exports: [MembersRepository, MembersService],
})
export class GymMembersModule {}
