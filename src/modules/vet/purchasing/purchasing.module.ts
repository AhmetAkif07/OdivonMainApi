import { Module } from '@nestjs/common';
import { AuditModule } from '../../../shared/audit/audit.module';
import { StockMovementsRepository } from '../stock/stock-movements/stock-movements.repository';
import { ApprovalRequestsController } from './approvals/approval-requests.controller';
import { ApprovalRequestsRepository } from './approvals/approval-requests.repository';
import { ApprovalRequestsService } from './approvals/approval-requests.service';
import { PurchaseOrdersController } from './orders/purchase-orders.controller';
import { PurchaseOrdersRepository } from './orders/purchase-orders.repository';
import { PurchaseOrdersService } from './orders/purchase-orders.service';
import { RfqsController } from './rfqs/rfqs.controller';
import { RfqsRepository } from './rfqs/rfqs.repository';
import { RfqsService } from './rfqs/rfqs.service';
import { ApprovalWorkflowsController } from './workflows/approval-workflows.controller';
import { ApprovalWorkflowsRepository } from './workflows/approval-workflows.repository';
import { ApprovalWorkflowsService } from './workflows/approval-workflows.service';

@Module({
  imports: [AuditModule],
  controllers: [
    ApprovalWorkflowsController,
    ApprovalRequestsController,
    RfqsController,
    PurchaseOrdersController,
  ],
  providers: [
    StockMovementsRepository,
    ApprovalWorkflowsRepository,
    ApprovalWorkflowsService,
    ApprovalRequestsRepository,
    ApprovalRequestsService,
    RfqsRepository,
    RfqsService,
    PurchaseOrdersRepository,
    PurchaseOrdersService,
  ],
  exports: [
    ApprovalWorkflowsService,
    ApprovalRequestsService,
    RfqsService,
    PurchaseOrdersService,
  ],
})
export class PurchasingModule {}
