import { Module } from '@nestjs/common';
import { MailModule } from '../../shared/mail/mail.module';
import { RentacarController } from './rentacar.controller';
import { RentacarPublicController } from './rentacar-public.controller';
import { RentacarPublicService } from './rentacar-public.service';
import { RentacarService } from './rentacar.service';

@Module({
  imports: [MailModule],
  controllers: [RentacarController, RentacarPublicController],
  providers: [RentacarService, RentacarPublicService],
  exports: [RentacarService],
})
export class RentacarModule {}
