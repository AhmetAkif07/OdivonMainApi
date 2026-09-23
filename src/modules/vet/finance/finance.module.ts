import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { DefinitionsModule } from '../definitions/definitions.module';
import { StockModule } from '../stock/stock.module';
import { CashMovementsController } from './cash-movements/cash-movements.controller';
import { CashMovementsRepository } from './cash-movements/cash-movements.repository';
import { CashMovementsService } from './cash-movements/cash-movements.service';
import { CollectionsController } from './collections/collections.controller';
import { CollectionsRepository } from './collections/collections.repository';
import { CollectionsService } from './collections/collections.service';
import { SalesController } from './sales/sales.controller';
import { SalesRepository } from './sales/sales.repository';
import { SalesService } from './sales/sales.service';

@Module({
  imports: [CustomersModule, DefinitionsModule, StockModule],
  controllers: [SalesController, CollectionsController, CashMovementsController],
  providers: [
    SalesRepository,
    SalesService,
    CollectionsRepository,
    CollectionsService,
    CashMovementsRepository,
    CashMovementsService,
  ],
})
export class FinanceModule {}
