import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateFgasRecordDto } from './fgas.dto';

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
});
