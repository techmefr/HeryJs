import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * A resource folder is a resource folder wherever it sits. This repository keeps
 * its own in examples/ rather than src/functional/, so scanning only the latter
 * would leave the convention unenforced on the only resource that exists: the
 * suite would pass by having nothing to look at.
 */
const RESOURCE_ROOTS = [
  join(__dirname, 'functional'),
  join(__dirname, '..', 'examples'),
];

const REQUIRED_SUFFIXES = [
  '.module.ts',
  '.controller.ts',
  '.service.ts',
  '.policy.ts',
  '.dto.ts',
  '.spec.ts',
];

/**
 * A directory carrying its own package.json is a package, not a domain: the
 * example module in examples/ is a module the way a published one is, and a
 * module is not made of a controller, a policy and a DTO.
 */
function isPackage(dir: string): boolean {
  return existsSync(join(dir, 'package.json'));
}

function listDomains(): Array<{ name: string; path: string }> {
  return RESOURCE_ROOTS.filter((root) => existsSync(root)).flatMap((root) =>
    readdirSync(root)
      .map((entry) => ({ name: entry, path: join(root, entry) }))
      .filter(
        (entry) => statSync(entry.path).isDirectory() && !isPackage(entry.path),
      ),
  );
}

describe('functional domain conventions', () => {
  const domains = listDomains();

  it('has at least one resource to check the conventions against', () => {
    expect(domains.length).toBeGreaterThan(0);
  });

  it.each(domains)('$name has every conventional file', ({ name, path }) => {
    const files = readdirSync(path);

    for (const suffix of REQUIRED_SUFFIXES) {
      expect(files).toContain(`${name}${suffix}`);
    }
  });
});
