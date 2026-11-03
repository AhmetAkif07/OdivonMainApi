import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { GymStore } from '../../shared/gym-store';
import { CreateGymBankDto, GymBank, UpdateGymBankDto } from './gym-bank.dto';

const DEFAULT_PARTNER_BANKS: Array<Omit<GymBank, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'deletedAt'>> = [
  {
    bankName: 'Garanti BBVA',
    branchName: 'Merkez Şube',
    accountNumber: '1002341',
    iban: 'TR62 0006 2000 0001 2345 6789 01',
    hasPos: true,
    posTerminalNo: 'GAR-0091823',
    posModel: 'Beko 300TR Android POS',
    posCommissionRate: 1.85,
    isDefaultPos: true,
    status: 'active',
    colorTag: 'emerald',
  },
  {
    bankName: 'Akbank',
    branchName: 'Ticari Şube',
    accountNumber: '4452109',
    iban: 'TR44 0004 6000 0002 3456 7890 12',
    hasPos: true,
    posTerminalNo: 'AKB-0043120',
    posModel: 'Ingenico Move 5000',
    posCommissionRate: 1.95,
    isDefaultPos: false,
    status: 'active',
    colorTag: 'rose',
  },
  {
    bankName: 'Yapı Kredi',
    branchName: 'Kurumsal Şube',
    accountNumber: '8821903',
    iban: 'TR12 0006 7000 0003 4567 8901 23',
    hasPos: true,
    posTerminalNo: 'YKB-0077812',
    posModel: 'Verifone V400m',
    posCommissionRate: 1.90,
    isDefaultPos: false,
    status: 'active',
    colorTag: 'blue',
  },
  {
    bankName: 'Ziraat Bankası',
    branchName: 'Girişimci Şube',
    accountNumber: '9901423',
    iban: 'TR56 0001 0000 0004 5678 9012 34',
    hasPos: false,
    status: 'active',
    colorTag: 'amber',
  },
];

@Injectable()
export class GymBankService {
  constructor(private readonly store: GymStore) {}

  async list(): Promise<GymBank[]> {
    const list = await this.store.list<GymBank>(TENANT_COLLECTION.gymBanks);
    if (!list || list.length === 0) {
      // Seed initial sample partner banks for convenience
      const seeded: GymBank[] = [];
      for (const b of DEFAULT_PARTNER_BANKS) {
        const created = await this.store.create(TENANT_COLLECTION.gymBanks, b as Record<string, unknown>);
        seeded.push(created as unknown as GymBank);
      }
      return seeded;
    }
    return list.sort((a, b) => (a.bankName || '').localeCompare(b.bankName || ''));
  }

  async getById(id: string): Promise<GymBank> {
    return this.store.getOrThrow<GymBank>(
      TENANT_COLLECTION.gymBanks,
      id,
      ErrorCode.GYM_ACCOUNTING_NOT_FOUND,
      'Banka kaydı bulunamadı',
    );
  }

  async create(dto: CreateGymBankDto): Promise<GymBank> {
    const payload = {
      bankName: dto.bankName.trim(),
      branchName: dto.branchName?.trim() || '',
      accountNumber: dto.accountNumber?.trim() || '',
      iban: dto.iban?.trim() || '',
      hasPos: Boolean(dto.hasPos ?? true),
      posTerminalNo: dto.posTerminalNo?.trim() || '',
      posModel: dto.posModel?.trim() || '',
      posCommissionRate: dto.posCommissionRate !== undefined ? Number(dto.posCommissionRate) : 0,
      isDefaultPos: Boolean(dto.isDefaultPos ?? false),
      status: dto.status || 'active',
      colorTag: dto.colorTag || 'indigo',
    };

    const created = await this.store.create(TENANT_COLLECTION.gymBanks, payload);
    return created as unknown as GymBank;
  }

  async update(id: string, dto: UpdateGymBankDto): Promise<GymBank> {
    const existing = await this.getById(id);
    const updatePayload: Record<string, unknown> = {};

    if (dto.bankName !== undefined) updatePayload['bankName'] = dto.bankName.trim();
    if (dto.branchName !== undefined) updatePayload['branchName'] = dto.branchName.trim();
    if (dto.accountNumber !== undefined) updatePayload['accountNumber'] = dto.accountNumber.trim();
    if (dto.iban !== undefined) updatePayload['iban'] = dto.iban.trim();
    if (dto.hasPos !== undefined) updatePayload['hasPos'] = Boolean(dto.hasPos);
    if (dto.posTerminalNo !== undefined) updatePayload['posTerminalNo'] = dto.posTerminalNo.trim();
    if (dto.posModel !== undefined) updatePayload['posModel'] = dto.posModel.trim();
    if (dto.posCommissionRate !== undefined) updatePayload['posCommissionRate'] = Number(dto.posCommissionRate);
    if (dto.isDefaultPos !== undefined) updatePayload['isDefaultPos'] = Boolean(dto.isDefaultPos);
    if (dto.status !== undefined) updatePayload['status'] = dto.status;
    if (dto.colorTag !== undefined) updatePayload['colorTag'] = dto.colorTag;

    await this.store.update(
      TENANT_COLLECTION.gymBanks,
      id,
      ErrorCode.GYM_ACCOUNTING_NOT_FOUND,
      'Banka kaydı güncellenemedi',
      updatePayload,
    );

    return {
      ...existing,
      ...updatePayload,
    } as GymBank;
  }

  async remove(id: string): Promise<{ id: string }> {
    return this.store.softDelete(
      TENANT_COLLECTION.gymBanks,
      id,
      ErrorCode.GYM_ACCOUNTING_NOT_FOUND,
      'Banka kaydı silinemedi',
    );
  }
}
