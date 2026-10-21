import type { AuditLog } from '@prisma/client';
import {
  AUDIT_CSV_COLUMNS,
  auditCsvHeader,
  auditEntryRecord,
  auditLines,
} from './audit-format';

function entry(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'a1',
    sequence: 7,
    tenantId: 'tenant-1',
    model: 'BlogPost',
    operation: 'update',
    recordId: 'post-1',
    data: { title: 'Hello' },
    userId: 'user-1',
    impersonatedBy: null,
    hash: 'h2',
    previousHash: 'h1',
    createdAt: new Date('2026-02-10T08:00:00.000Z'),
    ...overrides,
  };
}

describe('audit export formats', () => {
  it('names every hashed field plus both hashes, so a file can be checked offline', () => {
    expect(Object.keys(auditEntryRecord(entry()))).toEqual([
      ...AUDIT_CSV_COLUMNS,
    ]);
    expect(auditCsvHeader()).toBe(`${AUDIT_CSV_COLUMNS.join(',')}\n`);
  });

  it('writes one JSON object per line with the data as an object', () => {
    const lines = auditLines([entry(), entry({ sequence: 8 })], 'jsonl')
      .trimEnd()
      .split('\n');

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      sequence: 7,
      createdAt: '2026-02-10T08:00:00.000Z',
      data: { title: 'Hello' },
      previousHash: 'h1',
      hash: 'h2',
    });
  });

  it('quotes commas, quotes and newlines in a CSV cell', () => {
    const [row] = auditLines(
      [entry({ recordId: 'a,"b"\nc', data: { note: 'x,y' } })],
      'csv',
    ).split(/\n(?=\d)/);

    expect(row).toContain('"a,""b""\nc"');
    expect(row).toContain('"{""note"":""x,y""}"');
  });

  it('turns a leading formula character into plain text', () => {
    const csv = auditLines(
      [
        entry({ recordId: '=HYPERLINK("http://evil")' }),
        entry({ recordId: '+1' }),
        entry({ recordId: '-1' }),
        entry({ recordId: '@SUM(A1)' }),
      ],
      'csv',
    );

    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).toContain(",'+1,");
    expect(csv).toContain(",'-1,");
    expect(csv).toContain(",'@SUM(A1),");
  });

  it('leaves numbers alone and writes a missing value as an empty cell', () => {
    const csv = auditLines(
      [entry({ sequence: -3, recordId: null, userId: null })],
      'csv',
    );

    expect(csv.startsWith('-3,')).toBe(true);
    expect(csv).toContain(',BlogPost,update,,,,');
  });
});
