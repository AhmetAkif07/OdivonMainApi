import { SupportTicket } from './tickets.entity';
import { groupTicketsByProduct, groupTicketsByTenant, resolveTicketProduct } from './ticket-grouping';

function ticket(over: Partial<SupportTicket>): SupportTicket {
  return {
    id: 'TK', trackingNumber: 'TK', category: 'general_inquiry', categoryLabel: 'Genel Soru',
    subject: 's', description: 'd', fullName: 'f', email: 'e@x.com', priority: 'normal',
    status: 'pending', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
    ...over,
  };
}

describe('ticket grouping', () => {
  it('resolves product from explicit value, then single-product lists', () => {
    expect(resolveTicketProduct('vet', ['gym'])).toBe('vet');
    expect(resolveTicketProduct('nope', ['gym'])).toBe('gym');
    expect(resolveTicketProduct(undefined, ['gym', 'vet'], ['farm'])).toBe('farm');
    expect(resolveTicketProduct(undefined, ['gym', 'vet'])).toBeNull();
  });

  it('groups by product with open counts and unknown last', () => {
    const groups = groupTicketsByProduct([
      ticket({ product: 'gym' }),
      ticket({ product: 'gym', status: 'completed' }),
      ticket({}),
      ticket({ product: 'vet', status: 'in_progress' }),
      ticket({ product: 'vet' }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['vet', 'gym', 'unknown']);
    expect(groups[1]).toMatchObject({ label: 'Spor Salonu', total: 2, open: 1 });
    expect(groups[1].counts.completed).toBe(1);
  });

  it('groups by tenant and carries its product', () => {
    const groups = groupTicketsByTenant([
      ticket({ tenantId: 't1', tenantName: 'Fit Club', product: 'gym' }),
      ticket({ tenantId: 't1', tenantName: 'Fit Club', product: 'gym' }),
      ticket({}),
    ]);
    expect(groups[0]).toMatchObject({ key: 't1', label: 'Fit Club', total: 2, product: 'gym' });
    expect(groups[1].key).toBe('unknown');
  });
});
