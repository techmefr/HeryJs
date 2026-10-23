import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { adminContractViolations } from '../../devtools/conventions/check-admin-contract';

describe('the admin contract lint', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'admin-contract-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const controller = (name: string, body: string): string => {
    const file = path.join(dir, `${name}.controller.ts`);
    writeFileSync(file, `class Probe {\n${body}\n}\n`);

    return file;
  };

  const GOOD_SECTION = `
    @AdminSection({ id: 'mail', title: 'Mail', icon: 'mail', group: 'Messaging' })
    @Get()
    @Capability(canReadMail)
    list() {}`;

  it('accepts a section with an action that points at it', () => {
    const file = controller(
      'mail',
      `${GOOD_SECTION}
    @AdminAction({ id: 'mail-resend', title: 'Resend', icon: 'mail', section: 'mail', scope: 'row' })
    @Post(':id/resend')
    @Capability(canResend)
    resend() {}`,
    );

    expect(adminContractViolations([file])).toEqual([]);
  });

  it('refuses a contribution with no capability', () => {
    const file = controller(
      'nocap',
      `
    @AdminSection({ id: 'nocap', title: 'No cap', icon: 'box', group: 'Misc' })
    @Get()
    list() {}`,
    );

    expect(adminContractViolations([file])).toEqual([
      expect.stringContaining('carries no @Capability'),
    ]);
  });

  it('refuses an unknown icon, a bad id and a missing title', () => {
    const file = controller(
      'bad',
      `
    @AdminSection({ id: 'Bad Id', title: '', icon: 'rocket', group: 'Misc' })
    @Get()
    @Capability(canRead)
    list() {}`,
    );
    const violations = adminContractViolations([file]).join('\n');

    expect(violations).toContain('kebab-case id');
    expect(violations).toContain('non-empty title');
    expect(violations).toContain('icon "rocket"');
  });

  it('refuses an action that names no declared section', () => {
    const file = controller(
      'orphan',
      `
    @AdminAction({ id: 'purge', title: 'Purge', icon: 'box', section: 'ghost', scope: 'global' })
    @Post('purge')
    @Capability(canPurge)
    purge() {}`,
    );

    expect(adminContractViolations([file])).toEqual([
      expect.stringContaining('names section "ghost"'),
    ]);
  });

  it('refuses a GET action and a row action without :id', () => {
    const file = controller(
      'shape',
      `
    @AdminAction({ id: 'export', title: 'Export', icon: 'file', scope: 'global' })
    @Get('export')
    @Capability(canExport)
    export() {}

    @AdminAction({ id: 'retry', title: 'Retry', icon: 'zap', scope: 'row' })
    @Post('retry')
    @Capability(canRetry)
    retry() {}`,
    );
    const violations = adminContractViolations([file]).join('\n');

    expect(violations).toContain('must not be a GET');
    expect(violations).toContain('needs ":id"');
  });

  it('refuses a duplicate id across files and a section on a non-list route', () => {
    const first = controller('one', GOOD_SECTION);
    const second = controller(
      'two',
      `
    @AdminSection({ id: 'mail', title: 'Mail again', icon: 'mail', group: 'Messaging' })
    @Get(':id')
    @Capability(canReadMail)
    show() {}`,
    );
    const violations = adminContractViolations([first, second]).join('\n');

    expect(violations).toContain('already used');
    expect(violations).toContain('belongs on a list route');
  });

  it('refuses a contribution from a controller that vanishes in production', () => {
    const file = controller(
      'devonly',
      `
    @UseGuards(SessionGuard, DevOnlyGuard)
    ${GOOD_SECTION}`,
    );

    expect(adminContractViolations([file])).toEqual([
      expect.stringContaining('DevOnlyGuard'),
    ]);
  });
});
