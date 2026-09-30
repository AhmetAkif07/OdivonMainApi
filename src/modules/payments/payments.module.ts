import { Module } from '@nestjs/common';
import { IyzicoProvider } from './iyzico.provider';
import { PaymentCallbackController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController, PaymentCallbackController],
  providers: [IyzicoProvider, PaymentsService],
})
export class PaymentsModule {}
