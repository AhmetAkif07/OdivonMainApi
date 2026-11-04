import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  imports: [StockModule],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
