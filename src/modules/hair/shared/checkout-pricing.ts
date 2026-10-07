import { CommissionRuleRecord, resolveCommission } from './commission-engine';
import { hairInvalid, hairNotFound, hairPrecondition } from './hair-errors';
import { extractVat, PaymentLine, round2 } from './hair-money';

export type CheckoutItemType = 'service' | 'product' | 'package';

export interface CheckoutItemInput {
  type: CheckoutItemType;
  refId: string;
  quantity: number;
  discount?: number;
  /** Performing staff of a service line; defaults to the session's staff. */
  staffId?: string;
  /** Redeem a session of this customer package instead of charging the service (P-003). */
  customerPackageId?: string;
}

export interface ServiceRecord {
  name: string;
  price: number;
  categoryId?: string | null;
  vatRate?: number;
  productsUsed?: { productId: string; quantity: number }[];
}

export interface ProductRecord {
  name: string;
  salePrice: number;
  currentStock: number;
  vatRate?: number;
}

export interface PackagePlanRecord {
  name: string;
  price: number;
  active: boolean;
  totalSessions: number;
  validityDays: number;
  services?: { serviceId: string }[];
}

export interface CustomerPackageRecord {
  customerId: string;
  packageId?: string;
  remainingSessions: number;
  status: string;
  endDate?: string | null; // YYYY-MM-DD (inclusive) or ISO instant
  services?: { serviceId: string }[];
}

export interface StaffRecord {
  name: string;
  defaultCommissionPercent: number;
}

export interface CheckoutPricingInput {
  customerId: string;
  staffId: string;
  items: CheckoutItemInput[];
  payments: PaymentLine[];
  globalDiscount: number;
  services: Map<string, ServiceRecord>;
  products: Map<string, ProductRecord>;
  packagePlans: Map<string, PackagePlanRecord>;
  customerPackages: Map<string, CustomerPackageRecord>;
  staff: Map<string, StaffRecord>;
  rules: CommissionRuleRecord[];
  /** Local `YYYY-MM-DD` of today (package expiry check). */
  today: string;
}

export interface ResolvedSessionItem {
  type: CheckoutItemType;
  refId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  /** Charged amount of the line before the global discount (0 for a redeemed package session). */
  lineTotal: number;
  staffId: string | null;
  customerPackageId: string | null;
  vatRate: number;
}

export interface CommissionLine {
  staffId: string;
  staffName: string;
  serviceId: string;
  serviceName: string;
  basisAmount: number;
  amount: number;
  ruleId: string | null;
}

export interface CheckoutPricing {
  subtotal: number;
  totalAmount: number;
  vatTotal: number;
  resolvedItems: ResolvedSessionItem[];
  commissionLines: CommissionLine[];
  /** productId → quantity to take out of stock (sold products and service consumables). */
  productDecrements: Map<string, number>;
  /** productId → quantity consumed by services (S-002), a subset of `productDecrements`. */
  consumableDecrements: Map<string, number>;
  /** customerPackageId → sessions redeemed. */
  packageDecrements: Map<string, number>;
  /** packageId → number of plans sold in this checkout. */
  packageSales: Map<string, number>;
}

/** Tolerance for comparing money sums (P-001). */
export const MONEY_EPSILON = 0.01;

/**
 * Pure pricing step of a POS checkout (plan §8.2–§8.4): resolves each line against the catalog
 * (prices always come from the catalog, never from the client), checks stock and package balances
 * summed across repeated lines, applies line and global discounts, computes commissions and VAT and
 * checks that the payments add up to the total. Free of Firestore so the money math is unit tested.
 */
export function priceCheckout(input: CheckoutPricingInput): CheckoutPricing {
  let subtotal = 0;
  let vatGross = 0; // VAT of the line totals, scaled by the global discount at the end
  const resolvedItems: ResolvedSessionItem[] = [];
  const commissionLines: CommissionLine[] = [];
  const productDecrements = new Map<string, number>();
  const consumableDecrements = new Map<string, number>();
  const packageDecrements = new Map<string, number>();
  const packageSales = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, qty: number) =>
    map.set(key, (map.get(key) ?? 0) + qty);

  if (input.items.length === 0) throw hairInvalid('Sepette en az bir kalem olmalıdır.');

  for (const item of input.items) {
    const discount = item.discount ?? 0;
    if (item.customerPackageId && item.type !== 'service') {
      throw hairInvalid('Paket kullanımı yalnızca hizmet satırında yapılabilir.');
    }

    if (item.type === 'service') {
      const service = input.services.get(item.refId);
      if (!service) throw hairNotFound(`Hizmet bulunamadı: ${item.refId}`);
      const lineStaffId = item.staffId ?? input.staffId;
      const staff = input.staff.get(lineStaffId);
      if (!staff) throw hairNotFound('Personel bulunamadı.');
      const basis = round2(service.price * item.quantity);
      let lineTotal = basis - discount;

      if (item.customerPackageId) {
        const pkg = input.customerPackages.get(item.customerPackageId);
        if (!pkg) throw hairNotFound('Müşteri paketi bulunamadı.');
        if (pkg.customerId !== input.customerId) {
          throw hairPrecondition('Paket bu müşteriye ait değil.');
        }
        if (pkg.status !== 'active') throw hairPrecondition('Paket aktif değil.');
        if (pkg.endDate && pkg.endDate.slice(0, 10) < input.today) {
          throw hairPrecondition('Paketin süresi dolmuş.');
        }
        if (pkg.services?.length && !pkg.services.some((s) => s.serviceId === item.refId)) {
          throw hairPrecondition(`"${service.name}" bu pakete dahil değil.`);
        }
        const used = packageDecrements.get(item.customerPackageId) ?? 0;
        if (pkg.remainingSessions < used + item.quantity) {
          throw hairPrecondition('Paketin kalan seans hakkı yetersiz.');
        }
        add(packageDecrements, item.customerPackageId, item.quantity);
        lineTotal = 0; // P-003: a redeemed session is not charged
      } else if (discount > basis) {
        throw hairInvalid(`"${service.name}" için indirim satır tutarını aşamaz.`); // P-004
      }

      for (const used of service.productsUsed ?? []) {
        const qty = used.quantity * item.quantity;
        add(productDecrements, used.productId, qty);
        add(consumableDecrements, used.productId, qty);
      }

      const commission = resolveCommission({
        serviceId: item.refId,
        categoryId: service.categoryId,
        staffId: lineStaffId,
        basisAmount: basis,
        rules: input.rules,
        staffDefaultPercent: staff.defaultCommissionPercent,
      });
      if (commission.amount > 0) {
        commissionLines.push({
          staffId: lineStaffId,
          staffName: staff.name,
          serviceId: item.refId,
          serviceName: service.name,
          basisAmount: basis,
          amount: commission.amount,
          ruleId: commission.ruleId ?? null,
        });
      }

      const vatRate = service.vatRate ?? 0;
      subtotal += lineTotal;
      vatGross += extractVat(lineTotal, vatRate);
      resolvedItems.push({
        type: 'service',
        refId: item.refId,
        name: service.name,
        quantity: item.quantity,
        unitPrice: service.price,
        discount: item.customerPackageId ? 0 : discount,
        lineTotal: round2(lineTotal),
        staffId: lineStaffId,
        customerPackageId: item.customerPackageId ?? null,
        vatRate,
      });
    } else if (item.type === 'product') {
      const product = input.products.get(item.refId);
      if (!product) throw hairNotFound(`Ürün bulunamadı: ${item.refId}`);
      const basis = round2(product.salePrice * item.quantity);
      if (discount > basis) {
        throw hairInvalid(`"${product.name}" için indirim satır tutarını aşamaz.`);
      }
      add(productDecrements, item.refId, item.quantity);
      const lineTotal = basis - discount;
      const vatRate = product.vatRate ?? 0;
      subtotal += lineTotal;
      vatGross += extractVat(lineTotal, vatRate);
      resolvedItems.push({
        type: 'product',
        refId: item.refId,
        name: product.name,
        quantity: item.quantity,
        unitPrice: product.salePrice,
        discount,
        lineTotal: round2(lineTotal),
        staffId: item.staffId ?? null,
        customerPackageId: null,
        vatRate,
      });
    } else {
      const plan = input.packagePlans.get(item.refId);
      if (!plan) throw hairNotFound(`Paket bulunamadı: ${item.refId}`);
      if (!plan.active) throw hairPrecondition(`"${plan.name}" paketi satışta değil.`);
      const basis = round2(plan.price * item.quantity);
      if (discount > basis) throw hairInvalid(`"${plan.name}" için indirim satır tutarını aşamaz.`);
      add(packageSales, item.refId, item.quantity);
      const lineTotal = basis - discount;
      subtotal += lineTotal;
      resolvedItems.push({
        type: 'package',
        refId: item.refId,
        name: plan.name,
        quantity: item.quantity,
        unitPrice: plan.price,
        discount,
        lineTotal: round2(lineTotal),
        staffId: item.staffId ?? null,
        customerPackageId: null,
        vatRate: 0,
      });
    }
  }

  for (const [productId, qty] of productDecrements) {
    const product = input.products.get(productId);
    if (!product) throw hairNotFound(`Hizmette kullanılan ürün bulunamadı: ${productId}`);
    if (product.currentStock < qty) {
      throw hairPrecondition(`"${product.name}" için stok yetersiz.`); // S-003
    }
  }

  subtotal = round2(subtotal);
  if (input.globalDiscount > subtotal) {
    throw hairInvalid('Genel indirim toplam tutarı aşamaz.'); // P-005
  }
  const totalAmount = round2(subtotal - input.globalDiscount);
  const vatTotal = subtotal > 0 ? round2((vatGross * totalAmount) / subtotal) : 0;

  const paid = round2(input.payments.reduce((sum, p) => sum + p.amount, 0));
  if (Math.abs(paid - totalAmount) > MONEY_EPSILON) {
    throw hairPrecondition(
      `Ödeme tutarları toplamı (${paid}) işlem tutarına (${totalAmount}) eşit olmalı.`,
    ); // P-001
  }

  return {
    subtotal,
    totalAmount,
    vatTotal,
    resolvedItems,
    commissionLines,
    productDecrements,
    consumableDecrements,
    packageDecrements,
    packageSales,
  };
}
