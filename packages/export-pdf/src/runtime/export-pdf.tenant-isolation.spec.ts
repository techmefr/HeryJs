import { inflateSync } from 'node:zlib';
import type { Exportable } from '@heryjs/core/drivers';
import { TenantContextStorage } from '@heryjs/core/tenancy';
import { PdfExportDriver } from './pdf-export.driver';

const driver = new PdfExportDriver();

const OF_A = '111111';
const OF_B = '999999';

function exportableOf(values: string[]): Exportable {
  return {
    filename: 'tasks',
    columns: ['code'],
    rows: () => values.map((code) => ({ code })),
  };
}

function contentOf(pdf: Buffer): string {
  const source = pdf.toString('latin1');
  const streams = [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];

  return streams
    .map((match) => {
      const raw = Buffer.from(match[1] ?? '', 'latin1');

      try {
        return inflateSync(raw).toString('latin1');
      } catch {
        return raw.toString('latin1');
      }
    })
    .join('\n');
}

function hasText(pdf: Buffer, text: string): boolean {
  return contentOf(pdf).includes(Buffer.from(text, 'latin1').toString('hex'));
}

describe('tenant isolation', () => {
  it('renders two tenants exporting at once into two files that each hold only their own rows', async () => {
    const [ofA, ofB] = await Promise.all([
      TenantContextStorage.run({ tenantId: 'tenant-a' }, () =>
        driver.render(exportableOf([OF_A])),
      ),
      TenantContextStorage.run({ tenantId: 'tenant-b' }, () =>
        driver.render(exportableOf([OF_B])),
      ),
    ]);

    expect(hasText(ofA, OF_A)).toBe(true);
    expect(hasText(ofA, OF_B)).toBe(false);
    expect(hasText(ofB, OF_B)).toBe(true);
    expect(hasText(ofB, OF_A)).toBe(false);
  });

  it('carries nothing of a previous tenant export into the next one', async () => {
    await TenantContextStorage.run({ tenantId: 'tenant-b' }, () =>
      driver.render(exportableOf([OF_B])),
    );
    const ofA = await TenantContextStorage.run({ tenantId: 'tenant-a' }, () =>
      driver.render(exportableOf([])),
    );

    expect(hasText(ofA, OF_B)).toBe(false);
  });
});
