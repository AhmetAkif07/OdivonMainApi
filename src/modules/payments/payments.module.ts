import { Module } from '@nestjs/common';
import { GymAccessModule } from '../gym/access/access.module';
import { GymPaymentCredentialsService } from './gym-payment-credentials.service';
import { GymPaymentSettingsController } from './gym-payment-settings.controller';
import { IyzicoProvider } from './iyzico.provider';
import { SaasBillingController } from './saas-billing.controller';
import { SaasBillingService } from './saas-billing.service';
import { PaymentCallbackController, PaymentWebhookController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RentacarPaymentsController } from './rentacar-payments.controller';

@Module({
  imports: [GymAccessModule],
  controllers: [PaymentsController, PaymentCallbackController, PaymentWebhookController, GymPaymentSettingsController, RentacarPaymentsController, SaasBillingController],
  providers: [IyzicoProvider, PaymentsService, GymPaymentCredentialsService, SaasBillingService],
  exports: [PaymentsService, SaasBillingService],
})
export class PaymentsModule {}
