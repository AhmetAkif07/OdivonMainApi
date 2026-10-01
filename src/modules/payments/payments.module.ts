import { Module } from '@nestjs/common';
import { GymAccessModule } from '../gym/access/access.module';
import { IyzicoProvider } from './iyzico.provider';
import { PaymentCallbackController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [GymAccessModule],
  controllers: [PaymentsController, PaymentCallbackController],
  providers: [IyzicoProvider, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
