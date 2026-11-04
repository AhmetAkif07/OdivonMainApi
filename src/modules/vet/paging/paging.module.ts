import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { PagingController } from './paging.controller';
import { ClinicPagesRepository, PagingService } from './paging.service';

@Module({
  imports: [IdentityModule],
  controllers: [PagingController],
  providers: [ClinicPagesRepository, PagingService],
})
export class PagingModule {}
