import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateFgasOperationDto, CreateFgasRecordDto } from './fgas.dto';

describe('F-Gas DTO validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

  it('accepts a complete production equipment payload', async () => {
    const dto = (await pipe.transform(
      {
        name: 'Merkez Chiller Sistemi',
        location: 'İstanbul / Merkez',
        equipmentType: 'stationary-refrigeration',
        refrigerant: 'R-32',
        refrigerantChargeKg: 18.5,
        co2EquivalentTonnes: 12.5,
        inspectionIntervalMonths: 12,
        status: 'active',
      },
      { type: 'body', metatype: CreateFgasRecordDto },
    )) as CreateFgasRecordDto;
    expect(dto.refrigerantChargeKg).toBe(18.5);
    expect(dto.inspectionIntervalMonths).toBe(12);
  });

  it('rejects unsupported control intervals and unknown fields', async () => {
    await expect(
      pipe.transform(
        {
          name: 'Merkez Chiller Sistemi',
          location: 'İstanbul / Merkez',
          equipmentType: 'stationary-refrigeration',
          inspectionIntervalMonths: 5,
          tenantId: 'forged-tenant',
        },
        { type: 'body', metatype: CreateFgasRecordDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates operational evidence and rejects unsafe unknown fields', async () => {
    const dto = (await pipe.transform(
      {
        title: 'R-32 geri kazanımı',
        status: 'completed',
        movementType: 'recovery',
        quantityKg: 4.25,
        evidenceRefs: ['DOC-2026-44'],
      },
      { type: 'body', metatype: CreateFgasOperationDto },
    )) as CreateFgasOperationDto;
    expect(dto.quantityKg).toBe(4.25);
    await expect(
      pipe.transform(
        { title: 'Kontrol', tenantId: 'forged' },
        { type: 'body', metatype: CreateFgasOperationDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
