import { auditWhere, parseAuditFilter } from './audit-filter';

describe('audit filter', () => {
  it('always scopes to the tenant, with or without a filter', () => {
    expect(auditWhere('t1', {})).toEqual({ tenantId: 't1' });
    expect(auditWhere('t1', parseAuditFilter({ model: 'BlogPost' }))).toEqual({
      tenantId: 't1',
      model: 'BlogPost',
    });
  });

  it('turns a date range into an inclusive createdAt window', () => {
    const filter = parseAuditFilter({
      from: '2026-02-01',
      to: '2026-02-28T23:59:59.999Z',
    });

    expect(auditWhere('t1', filter)).toEqual({
      tenantId: 't1',
      createdAt: {
        gte: new Date('2026-02-01'),
        lte: new Date('2026-02-28T23:59:59.999Z'),
      },
    });
  });

  it('ignores the paging parameters it shares a query string with', () => {
    expect(parseAuditFilter({ page: '2', limit: '50' })).toEqual({});
  });

  it('refuses a date that does not parse and a range that runs backwards', () => {
    expect(() => parseAuditFilter({ from: 'yesterday-ish' })).toThrow(
      /Invalid value for "from"/,
    );
    expect(() =>
      parseAuditFilter({ from: '2026-03-01', to: '2026-02-01' }),
    ).toThrow(/Invalid value for "from"/);
  });
});
