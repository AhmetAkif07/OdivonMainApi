import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { ApprovalRequestsService } from '../approvals/approval-requests.service';
import { PurchaseOrdersService } from '../orders/purchase-orders.service';
import { AddSupplierBidDto, AwardBidDto, CreateRfqDto, UpdateRfqDto } from './rfq.dto';
import { Rfq, RfqSupplierBid } from './rfq.entity';
import { RfqsRepository } from './rfqs.repository';

@Injectable()
export class RfqsService {
  constructor(
    private readonly repo: RfqsRepository,
    private readonly approvals: ApprovalRequestsService,
    private readonly orders: PurchaseOrdersService,
  ) {}

  create(dto: CreateRfqDto): Promise<Rfq> {
    return this.repo.create(dto);
  }

  getById(id: string): Promise<Rfq> {
    return this.repo.getByIdOrThrow(id);
  }

  list(): Promise<Rfq[]> {
    return this.repo.collect();
  }

  update(id: string, dto: UpdateRfqDto): Promise<Rfq> {
    return this.repo.update(id, dto);
  }

  delete(id: string): Promise<void> {
    return this.repo.softDelete(id);
  }

  /**
   * RFQ'ya tedarikçi teklifi ekler
   */
  async addBid(id: string, dto: AddSupplierBidDto): Promise<Rfq> {
    const rfq = await this.repo.getByIdOrThrow(id);

    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;

    const lines = dto.lines.map((l) => {
      const gross = l.offeredQuantity * l.unitPrice;
      const discount = gross * ((l.discountPercent || 0) / 100);
      const taxable = gross - discount;
      const tax = taxable * ((l.taxRatio || 20) / 100);
      const lineTotal = taxable + tax;

      subtotal += gross;
      discountTotal += discount;
      taxTotal += tax;

      return {
        productId: l.productId,
        productName: l.productName,
        offeredQuantity: l.offeredQuantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent || 0,
        taxRatio: l.taxRatio || 20,
        lineTotal: Math.round(lineTotal * 100) / 100,
        notes: l.notes || null,
      };
    });

    const grandTotal = Math.round((subtotal - discountTotal + taxTotal) * 100) / 100;

    const bid: RfqSupplierBid = {
      id: 'bid-' + Date.now().toString(36),
      supplierId: dto.supplierId,
      supplierName: dto.supplierName,
      bidDate: dto.bidDate,
      deliveryDays: dto.deliveryDays,
      paymentTermDays: dto.paymentTermDays,
      validityDays: dto.validityDays || 30,
      shippingIncluded: dto.shippingIncluded ?? true,
      lines,
      subtotal: Math.round(subtotal * 100) / 100,
      discountTotal: Math.round(discountTotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      grandTotal,
      notes: dto.notes || null,
      isWinner: false,
    };

    rfq.bids.push(bid);
    if (rfq.status === 'collecting' && rfq.bids.length >= 2) {
      rfq.status = 'evaluation';
    }

    this.recalculateScores(rfq);
    return this.repo.saveRaw(rfq);
  }

  /**
   * Tedarikçi teklifini siler
   */
  async removeBid(id: string, bidId: string): Promise<Rfq> {
    const rfq = await this.repo.getByIdOrThrow(id);
    rfq.bids = rfq.bids.filter((b) => b.id !== bidId);
    this.recalculateScores(rfq);
    return this.repo.saveRaw(rfq);
  }

  /**
   * Teklifleri yan yana karşılaştırıp ağırlıklı puan kartını hesaplar
   */
  recalculateScores(rfq: Rfq): void {
    if (rfq.bids.length === 0) return;

    const minPrice = Math.min(...rfq.bids.map((b) => b.grandTotal));
    const minDelivery = Math.min(...rfq.bids.map((b) => Math.max(1, b.deliveryDays)));
    const maxTerm = Math.max(...rfq.bids.map((b) => Math.max(1, b.paymentTermDays)));

    for (const b of rfq.bids) {
      // Fiyat puanı (En ucuz 100)
      const priceScore = minPrice > 0 ? Math.round((minPrice / b.grandTotal) * 100) : 100;
      // Teslimat puanı (En hızlı 100)
      const deliveryScore = b.deliveryDays > 0 ? Math.round((minDelivery / b.deliveryDays) * 100) : 100;
      // Vade puanı (En uzun vade 100)
      const paymentTermScore = maxTerm > 0 ? Math.round((b.paymentTermDays / maxTerm) * 100) : 100;
      // Tedarikçi güvenilirlik baz puanı
      const supplierRatingScore = b.shippingIncluded ? 95 : 85;

      // Ağırlıklı Toplam: %50 Fiyat, %20 Teslimat, %20 Vade, %10 Güvenilirlik
      const totalWeightedScore =
        Math.round(
          (priceScore * 0.5 + deliveryScore * 0.2 + paymentTermScore * 0.2 + supplierRatingScore * 0.1) *
            10,
        ) / 10;

      b.scoreBreakdown = {
        priceScore,
        deliveryScore,
        paymentTermScore,
        supplierRatingScore,
        totalWeightedScore,
      };
    }
  }

  /**
   * Kazanan teklifi belirler ve gerekiyorsa onay akışına sokar
   */
  async awardBid(id: string, dto: AwardBidDto): Promise<Rfq> {
    const rfq = await this.repo.getByIdOrThrow(id);
    const selected = rfq.bids.find((b) => b.id === dto.bidId);
    if (!selected) {
      throw new AppException(ErrorCode.STOCK_INVALID, 'Seçilen teklif bulunamadı');
    }

    for (const b of rfq.bids) {
      b.isWinner = b.id === dto.bidId;
      b.awardReason = b.id === dto.bidId ? dto.reason : null;
    }

    rfq.awardedBidId = selected.id;
    rfq.awardedSupplierName = selected.supplierName;
    rfq.awardReason = dto.reason;
    rfq.awardedAt = new Date().toISOString();

    // Onay akışına gönder
    const approval = await this.approvals.submit({
      targetType: 'rfq',
      targetId: rfq.id,
      documentNo: rfq.rfqNo,
      title: `${rfq.title} (${selected.supplierName} - ${selected.grandTotal} TL)`,
      totalAmount: selected.grandTotal,
      requestedByUserName: 'Satınalma / Teklif Komisyonu',
    });

    rfq.approvalRequestId = approval.id;
    rfq.status = approval.status === 'approved' ? 'awarded' : 'pending_approval';

    return this.repo.saveRaw(rfq);
  }

  /**
   * Onaylanmış / kazanan tekliften Satın Alma Siparişi oluşturur
   */
  async createPurchaseOrderFromRfq(id: string): Promise<any> {
    const rfq = await this.repo.getByIdOrThrow(id);
    const winner = rfq.bids.find((b) => b.id === rfq.awardedBidId);
    if (!winner) {
      throw new AppException(ErrorCode.STOCK_INVALID, 'Kazanan teklif belirlenmemiş');
    }

    const today = new Date();
    const expected = new Date(today);
    expected.setDate(expected.getDate() + (winner.deliveryDays || 3));

    const po = await this.orders.create({
      orderNo: 'SIP-' + rfq.rfqNo.replace('TEK-', ''),
      supplierId: winner.supplierId,
      supplierName: winner.supplierName,
      rfqId: rfq.id,
      demandId: rfq.demandId || null,
      orderDate: today.toISOString().slice(0, 10),
      expectedDeliveryDate: expected.toISOString().slice(0, 10),
      paymentTerm: `${winner.paymentTermDays} Gün Vade`,
      status: 'approved',
      lines: winner.lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        orderedQuantity: l.offeredQuantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent,
        taxRatio: l.taxRatio,
      })),
      notes: `${rfq.rfqNo} teklif değerlendirmesi üzerinden otomatik oluşturuldu. Gerekçe: ${rfq.awardReason || ''}`,
    });

    rfq.purchaseOrderId = po.id;
    rfq.status = 'awarded';
    await this.repo.saveRaw(rfq);

    return po;
  }
}
