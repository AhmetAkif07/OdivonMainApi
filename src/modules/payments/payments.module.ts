import { Module } from '@nestjs/common';
import { GymAccessModule } from '../gym/access/access.module';
import { GymPaymentCredentialsService } from './gym-payment-credentials.service';
import { GymPaymentSettingsController } from './gym-payment-settings.controller';
import { IyzicoProvider } from './iyzico.provider';
import { SaasBillingController } from './saas-billing.controller';
import { SaasBillingService } from './saas-billing.service';
import { PaymentCallbackController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [GymAccessModule],
  controllers: [PaymentsController, PaymentCallbackController, GymPaymentSettingsController, SaasBillingController],
  providers: [IyzicoProvider, PaymentsService, GymPaymentCredentialsService, SaasBillingService],
  exports: [PaymentsService, SaasBillingService],
})
export class PaymentsModule {}
