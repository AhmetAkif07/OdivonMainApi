import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { BaseDocument } from '../../../shared/firestore/base-document';
import { AccessSyncService } from '../access/access-sync.service';
import { MembersRepository } from '../members/members.repository';
import { PackagesRepository } from '../packages/packages.repository';
import { GymStore } from '../shared/gym-store';
import { applyPackage } from '../shared/membership';
import { GymListQueryDto, GymRecordDto } from '../shared/ops.dto';

type Doc = BaseDocument & Record<string, unknown>;

const WALLET_TX_TYPES = ['deposit', 'debit', 'refund'] as const;
type WalletTxType = (typeof WALLET_TX_TYPES)[number];

/** Staff wallet/package routes act on a member, never implicitly on the calling staff account. */
function requireTargetMember(dto: GymRecordDto): string {
  const userId = dto.userId || dto.memberId;
  if (!userId) {
    throw new AppException(ErrorCode.VALIDATION_ERROR, 'userId is required');
  }
  return userId;
}

function requirePositiveAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppException(ErrorCode.VALIDATION_ERROR, 'amount must be a positive number');
  }
  return amount;
}

@Injectable()
export class GymCommerceService {
  constructor(
    private readonly store: GymStore,
    private readonly members: MembersRepository,
    private readonly accessSync: AccessSyncService,
    private readonly packages: PackagesRepository,
  ) {}

  listDocuments(query: GymListQueryDto) {
    const userId = query.userId || query.memberId;
    return this.store.page<Doc>(TENANT_COLLECTION.gymMemberDocuments, query, (item) => {
      if (userId && item['userId'] !== userId) return false;
      return true;
    });
  }

  createDocument(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymMemberDocuments, {
      ...dto,
      userId: dto.userId || dto.memberId || this.store.userId(),
      status: dto.status ?? 'pending_review',
      issueDate: dto.issueDate || new Date().toISOString(),
    });
  }

  updateDocument(id: string, dto: GymRecordDto) {
    const patch = { ...dto };
    if (dto.status === 'approved') {
      patch.verifiedAt = new Date().toISOString();
    }
    return this.store.update(
      TENANT_COLLECTION.gymMemberDocuments,
      id,
      ErrorCode.GYM_DOCUMENT_NOT_FOUND,
      'Document not found',
      patch,
    );
  }

  removeDocument(id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.gymMemberDocuments,
      id,
      ErrorCode.GYM_DOCUMENT_NOT_FOUND,
      'Document not found',
    );
  }

  listWallet(query: GymListQueryDto) {
    const userId = query.userId || query.memberId || this.store.userId();
    return this.store.page<Doc>(TENANT_COLLECTION.gymWalletTx, query, (item) => item['userId'] === userId);
  }

  async adjustWallet(dto: GymRecordDto) {
    const userId = requireTargetMember(dto);
    const type = (dto.walletType || dto.type || 'deposit') as WalletTxType;
    if (!WALLET_TX_TYPES.includes(type)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Unknown wallet transaction type');
    }
    const amount = requirePositiveAmount(dto.amount);
    const member = await this.members.getByIdOrThrow(userId);
    const current = Number(member.walletBalance ?? 0);
    const next = type === 'debit' ? current - amount : current + amount;
    if (next < 0) {
      throw new AppException(ErrorCode.GYM_WALLET_INSUFFICIENT, 'Insufficient wallet balance');
    }
    await this.members.save({ ...member, walletBalance: next });
    return this.store.create(TENANT_COLLECTION.gymWalletTx, {
      userId,
      type,
      amount,
      description: dto.description ?? dto.notes ?? 'Cüzdan hareketi',
      referenceId: dto.referenceId ?? null,
      referenceType: dto.referenceType ?? 'other',
      status: 'completed',
      paymentMethod: dto.paymentMethod ?? 'cash',
      notes: dto.notes ?? '',
    });
  }

  /**
   * Staff-side package sale. Price, duration and name always come from the package record, so a
   * caller cannot extend a membership for an arbitrary price or length.
   */
  async purchasePackage(dto: GymRecordDto) {
    const userId = requireTargetMember(dto);
    if (!dto.packageId) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'packageId is required');
    }
    const pkg = await this.packages.getByIdOrThrow(dto.packageId);
    if (pkg.status && pkg.status !== 'active') {
      throw new AppException(ErrorCode.GYM_PACKAGE_NOT_FOUND, 'Package is not available for sale');
    }
    const member = await this.members.getByIdOrThrow(userId);
    const amount = Number(pkg.price ?? 0);
    const method = dto.paymentMethod ?? 'cash';
    if (method === 'wallet' && amount > 0) {
      await this.adjustWallet({
        userId,
        walletType: 'debit',
        amount,
        description: dto.description ?? 'Paket ödemesi',
        referenceId: pkg.id,
        referenceType: 'package',
        paymentMethod: 'wallet',
      });
    }
    const now = new Date();
    const current = method === 'wallet' && amount > 0 ? await this.members.getByIdOrThrow(userId) : member;
    const updated = await this.members.save(applyPackage(current, pkg, amount, now));
    await this.accessSync.syncMemberSafely(updated);
    await this.store.create(TENANT_COLLECTION.gymAccountingEntries, {
      type: 'income',
      amount,
      category: 'membership',
      userId,
      description: dto.description ?? `${pkg.name} paket satışı`,
      referenceId: pkg.id,
      referenceType: 'membership',
      paymentMethod: method,
      entryDate: now.toISOString(),
    });
    return updated;
  }

  listCategories(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymShopCategories, query);
  }

  createCategory(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymShopCategories, {
      ...dto,
      key: dto.key || (dto.name || 'cat').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    });
  }

  updateCategory(id: string, dto: GymRecordDto) {
    return this.store.update(
      TENANT_COLLECTION.gymShopCategories,
      id,
      ErrorCode.GYM_CATEGORY_NOT_FOUND,
      'Category not found',
      dto,
    );
  }

  removeCategory(id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.gymShopCategories,
      id,
      ErrorCode.GYM_CATEGORY_NOT_FOUND,
      'Category not found',
    );
  }

  listProducts(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymShopProducts, query);
  }

  createProduct(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymShopProducts, {
      ...dto,
      status: dto.status ?? 'active',
      stock: dto.stock ?? 0,
      price: dto.price ?? 0,
    });
  }

  updateProduct(id: string, dto: GymRecordDto) {
    return this.store.update(
      TENANT_COLLECTION.gymShopProducts,
      id,
      ErrorCode.GYM_PRODUCT_NOT_FOUND,
      'Product not found',
      dto,
    );
  }

  removeProduct(id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.gymShopProducts,
      id,
      ErrorCode.GYM_PRODUCT_NOT_FOUND,
      'Product not found',
    );
  }

  listSales(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymShopSales, query, (item) => {
      if (query.userId && item['userId'] !== query.userId) return false;
      if (query.productId && item['productId'] !== query.productId) return false;
      return true;
    });
  }

  async checkout(dto: GymRecordDto) {
    const lines = (Array.isArray(dto.items) && dto.items.length
      ? dto.items
      : [
          {
            productId: dto.productId,
            quantity: dto.quantity ?? 1,
            unitPrice: dto.unitPrice,
            productName: dto.productName,
            isPackageIncluded: false,
          },
        ]) as Array<{
      productId?: string;
      quantity?: number;
      unitPrice?: number;
      productName?: string;
      isPackageIncluded?: boolean;
    }>;
    const method = dto.paymentMethod ?? 'cash';
    const sales: Doc[] = [];
    let grandTotal = 0;
    for (const line of lines) {
      const productId = String(line.productId || dto.productId || '');
      const product = (await this.store.getOrThrow(
        TENANT_COLLECTION.gymShopProducts,
        productId,
        ErrorCode.GYM_PRODUCT_NOT_FOUND,
        'Product not found',
      )) as Doc;
      const quantity = line.quantity ?? 1;
      const stock = Number(product['stock'] ?? 0);
      if (stock < quantity) {
        throw new AppException(ErrorCode.STOCK_INSUFFICIENT, 'Insufficient stock');
      }
      const unitPrice = line.isPackageIncluded ? 0 : (line.unitPrice ?? Number(product['price'] ?? 0));
      const lineTotal = unitPrice * quantity;
      grandTotal += lineTotal;
      await this.store.save(TENANT_COLLECTION.gymShopProducts, {
        ...product,
        stock: stock - quantity,
      } as Doc);
      const sale = (await this.store.create(TENANT_COLLECTION.gymShopSales, {
        userId: dto.userId ?? null,
        productId,
        productName: line.productName || product['name'],
        quantity,
        unitPrice,
        totalAmount: lineTotal,
        paymentMethod: method,
        discount: 0,
        notes: dto.notes ?? '',
        saleDate: new Date().toISOString(),
        status: 'completed',
      })) as Doc;
      sales.push(sale);
    }
    const totalAmount = Math.max(0, (dto.totalAmount ?? grandTotal) - (dto.discount ?? 0));
    if (method === 'wallet' && dto.userId && totalAmount > 0) {
      await this.adjustWallet({
        userId: dto.userId,
        walletType: 'debit',
        amount: totalAmount,
        description: dto.description ?? 'Mağaza satışı',
        referenceType: 'product',
        paymentMethod: 'promotion',
      });
    }
    if (totalAmount > 0) {
      await this.store.create(TENANT_COLLECTION.gymAccountingEntries, {
        type: 'income',
        amount: totalAmount,
        category: 'product-sale',
        description: dto.description ?? 'POS satışı',
        referenceId: sales[0]?.id,
        referenceType: 'product-sale',
        paymentMethod: method,
        entryDate: new Date().toISOString(),
        // Product breakdown of the receipt (panel: AccountingEntry.items).
        items: sales.map((sale) => ({
          productId: sale['productId'],
          productName: sale['productName'],
          quantity: sale['quantity'],
          unitPrice: sale['unitPrice'],
          totalAmount: sale['totalAmount'],
        })),
      });
    }
    return sales.length === 1 ? sales[0] : { items: sales, totalAmount };
  }

  async refundSale(id: string) {
    const sale = (await this.store.getOrThrow(
      TENANT_COLLECTION.gymShopSales,
      id,
      ErrorCode.GYM_SALE_NOT_FOUND,
      'Sale not found',
    )) as Doc;
    if (sale['status'] === 'refunded') {
      return sale;
    }
    const product = (await this.store.getOrThrow(
      TENANT_COLLECTION.gymShopProducts,
      String(sale['productId']),
      ErrorCode.GYM_PRODUCT_NOT_FOUND,
      'Product not found',
    )) as Doc;
    await this.store.save(TENANT_COLLECTION.gymShopProducts, {
      ...product,
      stock: Number(product['stock'] ?? 0) + Number(sale['quantity'] ?? 0),
    } as Doc);
    if (sale['paymentMethod'] === 'wallet' && sale['userId'] && Number(sale['totalAmount'] ?? 0) > 0) {
      await this.adjustWallet({
        userId: String(sale['userId']),
        walletType: 'refund',
        amount: Number(sale['totalAmount'] ?? 0),
        description: `İade: ${sale['productName']}`,
        referenceType: 'product',
      });
    }
    return this.store.update(TENANT_COLLECTION.gymShopSales, id, ErrorCode.GYM_SALE_NOT_FOUND, 'Sale not found', {
      status: 'refunded',
    });
  }

  removeSale(id: string) {
    return this.store.softDelete(TENANT_COLLECTION.gymShopSales, id, ErrorCode.GYM_SALE_NOT_FOUND, 'Sale not found');
  }

  listSupplierCategories(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymSupplierCategories, query);
  }

  createSupplierCategory(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymSupplierCategories, dto);
  }

  updateSupplierCategory(id: string, dto: GymRecordDto) {
    return this.store.update(
      TENANT_COLLECTION.gymSupplierCategories,
      id,
      ErrorCode.GYM_CATEGORY_NOT_FOUND,
      'Category not found',
      dto,
    );
  }

  removeSupplierCategory(id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.gymSupplierCategories,
      id,
      ErrorCode.GYM_CATEGORY_NOT_FOUND,
      'Category not found',
    );
  }

  listSuppliers(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymSuppliers, query);
  }

  createSupplier(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymSuppliers, {
      ...dto,
      balance: dto.balance ?? 0,
      status: dto.status ?? 'active',
    });
  }

  updateSupplier(id: string, dto: GymRecordDto) {
    return this.store.update(
      TENANT_COLLECTION.gymSuppliers,
      id,
      ErrorCode.GYM_SUPPLIER_NOT_FOUND,
      'Supplier not found',
      dto,
    );
  }

  removeSupplier(id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.gymSuppliers,
      id,
      ErrorCode.GYM_SUPPLIER_NOT_FOUND,
      'Supplier not found',
    );
  }

  listAccounting(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymAccountingEntries, query);
  }

  createAccounting(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymAccountingEntries, {
      ...dto,
      entryDate: dto.entryDate || new Date().toISOString(),
    });
  }

  updateAccounting(id: string, dto: GymRecordDto) {
    return this.store.update(
      TENANT_COLLECTION.gymAccountingEntries,
      id,
      ErrorCode.GYM_ACCOUNTING_NOT_FOUND,
      'Entry not found',
      dto,
    );
  }

  removeAccounting(id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.gymAccountingEntries,
      id,
      ErrorCode.GYM_ACCOUNTING_NOT_FOUND,
      'Entry not found',
    );
  }

  listAccountingCategories(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymAccountingCategories, query);
  }

  createAccountingCategory(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymAccountingCategories, dto);
  }

  removeAccountingCategory(id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.gymAccountingCategories,
      id,
      ErrorCode.GYM_CATEGORY_NOT_FOUND,
      'Category not found',
    );
  }


  async getExpenseAnalytics(query: { startDate?: string; endDate?: string; branchId?: string }) {
    const entries = await this.store.list<Doc>(TENANT_COLLECTION.gymAccountingEntries);
    const categories = await this.store.list<Doc>(TENANT_COLLECTION.gymAccountingCategories);

    const now = new Date();
    const startStr = query.startDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const endStr = query.endDate || now.toISOString().slice(0, 10);

    const categoryMap = new Map<string, string>();
    for (const cat of categories) {
      if (cat.id && cat['name']) categoryMap.set(cat.id, String(cat['name']));
    }

    let totalIncome = 0;
    let totalExpense = 0;
    const categoryTotals = new Map<string, { name: string; amount: number; count: number }>();
    const methodTotals = new Map<string, number>();

    const monthlyMap = new Map<string, { month: string; income: number; expense: number; net: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(mKey, { month: mKey, income: 0, expense: 0, net: 0 });
    }

    const toDateKey = (val: unknown): string => {
      if (!val) return '';
      if (typeof val === 'string') return val.slice(0, 10);
      if (val instanceof Date) return val.toISOString().slice(0, 10);
      if (typeof val === 'object') {
        const anyVal = val as Record<string, unknown>;
        if (typeof anyVal.toDate === 'function') {
          return (anyVal.toDate() as Date).toISOString().slice(0, 10);
        }
        if (typeof anyVal._seconds === 'number') {
          return new Date((anyVal._seconds as number) * 1000).toISOString().slice(0, 10);
        }
      }
      return '';
    };

    for (const entry of entries) {
      if (query.branchId && entry['branchId'] && entry['branchId'] !== query.branchId) continue;
      const amount = Number(entry['amount'] ?? 0);
      if (isNaN(amount) || amount <= 0) continue;

      const rawDate = toDateKey(entry['entryDate'] || entry['createdAt']);
      const monthKey = rawDate ? rawDate.slice(0, 7) : '';
      const type = String(entry['type'] ?? 'income').toLowerCase();
      const method = String(entry['paymentMethod'] ?? 'cash');

      if (monthKey && monthlyMap.has(monthKey)) {
        const trend = monthlyMap.get(monthKey)!;
        if (type === 'expense') {
          trend.expense += amount;
        } else {
          trend.income += amount;
        }
        trend.net = trend.income - trend.expense;
      }

      if (rawDate && (rawDate < startStr || rawDate > endStr)) continue;

      if (type === 'expense') {
        totalExpense += amount;
        const rawCat = String(entry['category'] || 'Diğer Gider');
        const catName = categoryMap.get(rawCat) || rawCat;
        const currentCat = categoryTotals.get(catName) || { name: catName, amount: 0, count: 0 };
        currentCat.amount += amount;
        currentCat.count++;
        categoryTotals.set(catName, currentCat);

        const currentMethod = methodTotals.get(method) || 0;
        methodTotals.set(method, currentMethod + amount);
      } else {
        totalIncome += amount;
      }
    }

    const netProfit = totalIncome - totalExpense;
    const expenseMargin = totalIncome > 0 ? (totalExpense / totalIncome) * 100 : 0;

    const categoryBreakdown = Array.from(categoryTotals.values())
      .map((c) => ({
        ...c,
        amount: Math.round(c.amount * 100) / 100,
        percentage: totalExpense > 0 ? Math.round((c.amount / totalExpense) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const monthlyTrend = Array.from(monthlyMap.values()).map((m) => ({
      ...m,
      income: Math.round(m.income * 100) / 100,
      expense: Math.round(m.expense * 100) / 100,
      net: Math.round(m.net * 100) / 100,
    }));

    return {
      startDate: startStr,
      endDate: endStr,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      expenseMarginPercentage: Math.round(expenseMargin * 10) / 10,
      topCategory: categoryBreakdown[0] || null,
      categoryBreakdown,
      monthlyTrend,
    };
  }

  getEinvoiceConfig() {
    return this.store.getSingleton(TENANT_COLLECTION.gymEinvoiceConfig);
  }

  saveEinvoiceConfig(dto: GymRecordDto) {
    return this.store.upsertSingleton(TENANT_COLLECTION.gymEinvoiceConfig, dto);
  }

  listInvoices(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymEinvoiceItems, query);
  }

  createInvoice(dto: GymRecordDto) {
    const kdvRate = dto.kdvRate ?? 20;
    const amount = dto.amount ?? 0;
    const kdvAmount = dto.kdvAmount ?? (amount * kdvRate) / 100;
    const now = new Date();
    const year = now.getFullYear();
    const defaultPrefix = dto.direction === 'inbound' ? 'GEL' : 'GIB';
    const prefix = (dto.prefix || (dto.invoiceNumber ? dto.invoiceNumber.slice(0, 3) : defaultPrefix)).toUpperCase();
    const generatedNo = `${prefix}${year}${String(Date.now()).slice(-9)}`;
    const gibUuid = dto.gibUuid || (typeof crypto !== 'undefined' && (crypto as any).randomUUID ? (crypto as any).randomUUID() : `uuid-${Date.now()}`);
    return this.store.create(TENANT_COLLECTION.gymEinvoiceItems, {
      ...dto,
      invoiceNumber: dto.invoiceNumber || generatedNo,
      gibUuid,
      direction: dto.direction ?? 'outbound',
      kdvRate,
      kdvAmount,
      totalAmount: dto.totalAmount ?? amount + kdvAmount,
      status: dto.status ?? 'draft',
      issueDate: dto.issueDate || now.toISOString(),
    });
  }

  updateInvoice(id: string, dto: GymRecordDto) {
    return this.store.update(
      TENANT_COLLECTION.gymEinvoiceItems,
      id,
      ErrorCode.GYM_EINVOICE_NOT_FOUND,
      'Invoice not found',
      dto,
    );
  }

  removeInvoice(id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.gymEinvoiceItems,
      id,
      ErrorCode.GYM_EINVOICE_NOT_FOUND,
      'Invoice not found',
    );
  }
}
