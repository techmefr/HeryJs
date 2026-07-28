import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const FUNCTIONAL_DIR = join(__dirname, 'functional');

const REQUIRED_SUFFIXES = [
  '.module.ts',
  '.controller.ts',
  '.service.ts',
  '.policy.ts',
  '.dto.ts',
  '.spec.ts',
];

function listDomains(): string[] {
  return readdirSync(FUNCTIONAL_DIR).filter((entry) =>
    statSync(join(FUNCTIONAL_DIR, entry)).isDirectory(),
  );
}

describe('functional domain conventions', () => {
  const domains = listDomains();

  if (domains.length === 0) {
    it('has no domains yet', () => {
      expect(domains).toHaveLength(0);
    });
    return;
  }

  it.each(domains)('%s has every conventional file', (domain) => {
    const files = readdirSync(join(FUNCTIONAL_DIR, domain));

    for (const suffix of REQUIRED_SUFFIXES) {
      const expected = `${domain}${suffix}`;
      expect(files).toContain(expected);
    }
  });
});
