import ExcelJS from 'exceljs';
import type { Exportable } from '#kernel/public/drivers';
import { TenantContextStorage } from '#kernel/public/tenancy';
import { XlsxExportDriver } from './xlsx-export.driver';

type LoadableBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

const driver = new XlsxExportDriver();

function exportableOf(titles: string[]): Exportable {
  return {
    filename: 'tasks',
    columns: ['title'],
    rows: () => titles.map((title) => ({ title })),
  };
}

async function titlesIn(rendered: Buffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(rendered as unknown as LoadableBuffer);
  const [sheet] = workbook.worksheets;
  const titles: string[] = [];

  sheet?.eachRow((row, index) => {
    if (index > 1) {
      titles.push(row.getCell(1).text);
    }
  });

  return titles;
}

describe('tenant isolation', () => {
  it('renders two tenants exporting at once into two files that each hold only their own rows', async () => {
    const [ofA, ofB] = await Promise.all([
      TenantContextStorage.run({ tenantId: 'tenant-a' }, () =>
        driver.render(exportableOf(['row of a', 'second of a'])),
      ),
      TenantContextStorage.run({ tenantId: 'tenant-b' }, () =>
        driver.render(exportableOf(['secret of b'])),
      ),
    ]);

    expect(await titlesIn(ofA)).toEqual(['row of a', 'second of a']);
    expect(await titlesIn(ofB)).toEqual(['secret of b']);
  });

  it('carries nothing of a previous tenant export into the next one', async () => {
    await TenantContextStorage.run({ tenantId: 'tenant-b' }, () =>
      driver.render(exportableOf(['secret of b'])),
    );
    const ofA = await TenantContextStorage.run({ tenantId: 'tenant-a' }, () =>
      driver.render(exportableOf([])),
    );

    expect(await titlesIn(ofA)).toEqual([]);
  });
});
