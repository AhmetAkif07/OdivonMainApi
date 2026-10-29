import { CashMovement } from '../cash-movements/cash-movement.entity';
import { Collection } from '../collections/collection.entity';
import { Sale } from '../sales/sale.entity';
import { CashSessionSummary, PaymentMethodTotal } from './cash-session.entity';
import { round2 } from './cash-sessions.repository';

const OPEN_ACCOUNT_PATTERN = /veresiye|açık hesap|acik hesap|cari/i;

/** Open-account (veresiye) sales are recorded on the till but no cash changes hands. */
export function isOpenAccountMethod(id: string | null, name: string): boolean {
  return Boolean(id && id.startsWith('pm-veresiye')) || OPEN_ACCOUNT_PATTERN.test(name);
}

export interface SummaryInput {
  cashRegisterId: string;
  openingAmount: number;
  from: string;
  to: string;
  sales: Sale[];
  collections: Collection[];
  movements: CashMovement[];
  paymentMethodNames: Map<string, string>;
}

/**
 * Builds the X/Z report for one till session. A record belongs to the session when it is on the
 * same cash register and was entered (createdAt) between opening and closing, so back-dated
 * entries made during the shift still count toward the drawer.
 */
export function buildCashSessionSummary(input: SummaryInput): CashSessionSummary {
  const inWindow = (item: { cashRegisterId: string | null; createdAt: string }) =>
    item.cashRegisterId === input.cashRegisterId && item.createdAt >= input.from && item.createdAt <= input.to;

  const methods = new Map<string, PaymentMethodTotal>();
  const methodTotal = (id: string | null): PaymentMethodTotal => {
    const key = id ?? '';
    let entry = methods.get(key);
    if (!entry) {
      const name = id ? (input.paymentMethodNames.get(id) ?? '') : 'Belirtilmemiş';
      entry = {
        paymentMethodId: id,
        paymentMethodName: name,
        incoming: 0,
        outgoing: 0,
        countsAsCash: !isOpenAccountMethod(id, name),
      };
      methods.set(key, entry);
    }
    return entry;
  };

  let salesIn = 0;
  let purchasesOut = 0;
  let creditSales = 0;
  let saleCount = 0;
  for (const sale of input.sales.filter(inWindow)) {
    const method = methodTotal(sale.paymentMethodId);
    if (sale.type === 'sale') {
      saleCount += 1;
      method.incoming += sale.total;
      if (method.countsAsCash) {
        salesIn += sale.total;
      } else {
        creditSales += sale.total;
      }
    } else {
      method.outgoing += sale.total;
      if (method.countsAsCash) {
        purchasesOut += sale.total;
      }
    }
  }

  let collectionsIn = 0;
  let paymentsOut = 0;
  for (const item of input.collections.filter(inWindow)) {
    const method = methodTotal(item.paymentMethodId);
    if (item.kind === 'collection') {
      method.incoming += item.amount;
      if (method.countsAsCash) collectionsIn += item.amount;
    } else {
      method.outgoing += item.amount;
      if (method.countsAsCash) paymentsOut += item.amount;
    }
  }

  let movementsIn = 0;
  let movementsOut = 0;
  for (const item of input.movements.filter(inWindow)) {
    if (item.direction === 'in') movementsIn += item.amount;
    else movementsOut += item.amount;
  }

  const expectedAmount =
    input.openingAmount + salesIn + collectionsIn + movementsIn - purchasesOut - paymentsOut - movementsOut;

  return {
    openingAmount: round2(input.openingAmount),
    salesIn: round2(salesIn),
    purchasesOut: round2(purchasesOut),
    collectionsIn: round2(collectionsIn),
    paymentsOut: round2(paymentsOut),
    movementsIn: round2(movementsIn),
    movementsOut: round2(movementsOut),
    creditSales: round2(creditSales),
    expectedAmount: round2(expectedAmount),
    saleCount,
    byPaymentMethod: [...methods.values()]
      .map((item) => ({ ...item, incoming: round2(item.incoming), outgoing: round2(item.outgoing) }))
      .sort((left, right) => right.incoming - left.incoming),
  };
}
