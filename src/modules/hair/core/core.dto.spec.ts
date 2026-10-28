import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { SaveHairBranchDto, UpdateHairSettingsDto } from './core.dto';

describe('UpdateHairSettingsDto definitions', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const validate = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: UpdateHairSettingsDto }) as Promise<UpdateHairSettingsDto>;

  it('accepts and trims definition lists', async () => {
    const dto = await validate({ definitions: { expenseCategories: [' Kira '], refundReasons: ['x'.repeat(120)] } });
    expect(dto.definitions?.expenseCategories).toEqual(['Kira']);
    expect(dto.definitions?.refundReasons).toHaveLength(1);
  });

  it.each([
    { expenseCategories: ['  '] },
    { productCategories: ['x'.repeat(81)] },
    { productUnits: Array.from({ length: 101 }, (_, i) => `u${i}`) },
    { refundReasons: ['x'.repeat(121)] },
    { productUnits: [1] },
    { colors: ['red'] },
  ])('rejects %j', async (definitions) => {
    await expect(validate({ definitions })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('SaveHairBranchDto logoUrl', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const validate = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: SaveHairBranchDto }) as Promise<SaveHairBranchDto>;

  it.each(['', 'https://cdn.example.com/logo.png', 'data:image/webp;base64,UklGRg=='])(
    'accepts %s',
    async (logoUrl) => {
      await expect(validate({ logoUrl })).resolves.toMatchObject({ logoUrl });
    },
  );

  it.each([
    'javascript:alert(1)',
    'http://example.com/logo.png',
    'data:image/svg+xml;base64,PHN2Zz4=',
    `data:image/png;base64,${'A'.repeat(90_000)}`,
  ])('rejects %s', async (logoUrl) => {
    await expect(validate({ logoUrl })).rejects.toBeInstanceOf(BadRequestException);
  });
});
