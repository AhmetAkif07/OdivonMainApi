import { Global, Module } from '@nestjs/common';
import { PaymentEventsService } from './payment-events.service';
import { PaymentModesService } from './payment-modes.service';

/** Global so payments (writes) and the platform panel (reads, mode changes) share one instance. */
@Global()
@Module({
  providers: [PaymentEventsService, PaymentModesService],
  exports: [PaymentEventsService, PaymentModesService],
})
export class PaymentMonitoringModule {}
