export interface SaleLineInput {
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRatio?: number;
  vatIncluded?: boolean;
}

export interface PricedLine {
  net: number;
  vat: number;
  total: number;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function priceLine(line: SaleLineInput): PricedLine {
  const gross = Math.max(0, line.quantity * line.unitPrice - (line.discount ?? 0));
  const ratio = (line.taxRatio ?? 0) / 100;
  if (line.vatIncluded !== false && ratio > 0) {
    const net = gross / (1 + ratio);
    return { net: roundMoney(net), vat: roundMoney(gross - net), total: roundMoney(gross) };
  }
  const vat = gross * ratio;
  return { net: roundMoney(gross), vat: roundMoney(vat), total: roundMoney(gross + vat) };
}

export function priceDocument(lines: SaleLineInput[], discount = 0): PricedLine {
  const summed = lines.reduce(
    (acc, line) => {
      const priced = priceLine(line);
      return { net: acc.net + priced.net, vat: acc.vat + priced.vat, total: acc.total + priced.total };
    },
    { net: 0, vat: 0, total: 0 },
  );
  const total = Math.max(0, summed.total - discount);
  return { net: roundMoney(summed.net), vat: roundMoney(summed.vat), total: roundMoney(total) };
}
