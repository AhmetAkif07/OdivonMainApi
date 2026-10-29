import { Module, forwardRef } from '@nestjs/common';
import { DefinitionsModule } from '../definitions/definitions.module';
import { DemandsController } from './demands/demands.controller';
import { DemandsRepository } from './demands/demands.repository';
import { DemandsService } from './demands/demands.service';
import { StockBalancesController } from './stock-balances.controller';
import { StockLedgerService } from './stock-ledger.service';
import { StockCountsController } from './stock-counts/stock-counts.controller';
import { StockCountsRepository } from './stock-counts/stock-counts.repository';
import { StockCountsService } from './stock-counts/stock-counts.service';
import { StockMovementsController } from './stock-movements/stock-movements.controller';
import { StockMovementsRepository } from './stock-movements/stock-movements.repository';
import { StockMovementsService } from './stock-movements/stock-movements.service';

@Module({
  imports: [forwardRef(() => DefinitionsModule)],
  controllers: [StockMovementsController, DemandsController, StockBalancesController, StockCountsController],
  providers: [StockMovementsRepository, StockMovementsService, StockLedgerService, DemandsRepository, DemandsService, StockCountsRepository, StockCountsService],
  exports: [StockLedgerService],
})
export class StockModule {}
