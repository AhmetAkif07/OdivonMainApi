import { Module } from '@nestjs/common';
import { GymAccessModule } from '../gym/access/access.module';
import { GymPaymentCredentialsService } from './gym-payment-credentials.service';
import { GymPaymentSettingsController } from './gym-payment-settings.controller';
import { IyzicoProvider } from './iyzico.provider';
import { PaymentCallbackController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [GymAccessModule],
  controllers: [PaymentsController, PaymentCallbackController, GymPaymentSettingsController],
  providers: [IyzicoProvider, PaymentsService, GymPaymentCredentialsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
