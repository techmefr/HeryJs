import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { COPY_ENTRIES } from './new';

const ROOT = path.join(__dirname, '..', '..');

const MANIFEST = JSON.parse(
  readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
) as { files: string[] };

/**
 * What the scaffolder reads out of the payload besides the entries it copies
 * verbatim: the blueprints it derives the demo's model names from, and the
 * template it writes the project's `.gitignore` from.
 */
const OTHER_PAYLOAD_READS = [
  'examples/blog-post.yaml',
  'templates/project.gitignore',
];

/** npm puts these in the tarball whatever `files` says. */
const ALWAYS_PUBLISHED = ['package.json', 'README.md', 'LICENSE'];

function shipped(entry: string): boolean {
  if (ALWAYS_PUBLISHED.includes(entry)) {
    return true;
  }

  return MANIFEST.files.some((pattern) => {
    if (pattern === entry || entry.startsWith(`${pattern}/`)) {
      return true;
    }

    const glob = pattern.match(/^(.*)\/\*(\.[a-z]+)$/);

    return (
      glob !== null &&
      path.dirname(entry) === glob[1] &&
      entry.endsWith(glob[2] as string)
    );
  });
}

/**
 * The published package is the payload `hery new` copies from, so anything the
 * scaffolder reads and `files` does not ship is a file missing from every
 * project scaffolded off npm -- and missing quietly. Both halves of this were
 * real: `.gitignore`, which npm strips from a tarball whatever the manifest
 * says, and the demo blueprints, without which a fresh project kept the
 * framework's own BlogPost models in its schema.
 */
describe('the payload the published package has to carry', () => {
  it.each([...COPY_ENTRIES])(
    'ships %s, which the scaffolder copies',
    (entry) => {
      expect(shipped(entry)).toBe(true);
    },
  );

  it.each(OTHER_PAYLOAD_READS)(
    'ships %s, which the scaffolder reads',
    (entry) => {
      expect(shipped(entry)).toBe(true);
    },
  );

  it.each([...COPY_ENTRIES, ...OTHER_PAYLOAD_READS])(
    'has %s in this repository to ship',
    (entry) => {
      expect(existsSync(path.join(ROOT, entry))).toBe(true);
    },
  );

  /**
   * npm renames a `.gitignore` out of the tarball, so an entry named that way
   * would pass every check here and still arrive missing. The project's is
   * written from a template instead; nothing may go back to copying it.
   */
  it('copies no file npm refuses to publish', () => {
    expect(COPY_ENTRIES).not.toContain('.gitignore');
    expect(MANIFEST.files).not.toContain('.gitignore');
  });
});
