import { Module } from '@nestjs/common';
import { RentacarController } from './rentacar.controller';
import { RentacarPublicController } from './rentacar-public.controller';
import { RentacarPublicService } from './rentacar-public.service';
import { RentacarService } from './rentacar.service';

@Module({
  controllers: [RentacarController, RentacarPublicController],
  providers: [RentacarService, RentacarPublicService],
  exports: [RentacarService],
})
export class RentacarModule {}
