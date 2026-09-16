import { loadBlueprint } from './blueprint';
import { buildResourceContext } from './resource-context';
import { dtoFile } from './templates';
import * as path from 'node:path';

const blueprint = loadBlueprint(
  path.join(__dirname, '..', '..', 'examples', 'blog-post.yaml'),
);
const dto = dtoFile(buildResourceContext(blueprint));

/**
 * A rule spanning two fields has exactly one home, and every schema a request
 * is validated against has to go through it. The failure this pins is the
 * quiet one: a new extension path -- today the update request adds an id and a
 * relations block -- built from the unrefined field object and never
 * re-applying the check, so the rules silently stop running on the one verb
 * that writes.
 */
describe('generated DTO rules hook', () => {
  it('declares one check function for the resource', () => {
    expect(dto).toContain('function checkBlogPost(');
  });

  it('applies it to create', () => {
    expect(dto).toContain(
      'export const createBlogPostSchema = blogPostFields.superRefine(checkBlogPost);',
    );
  });

  it('applies it to update', () => {
    expect(dto).toContain(
      'export const updateBlogPostSchema = blogPostUpdateFields.superRefine(checkBlogPost);',
    );
  });

  // The unrefined partial exists only to be extended; every use of it has to
  // end in the check, or the request body that actually writes skips the rules.
  it('re-applies it wherever the unrefined partial is extended', () => {
    const extensions = dto.split('blogPostUpdateFields.extend(').slice(1);

    expect(extensions.length).toBeGreaterThan(0);

    for (const extension of extensions) {
      expect(extension).toContain('.superRefine(checkBlogPost)');
    }
  });

  it('takes a partial input, so a rule reading two fields also runs on update', () => {
    expect(dto).toContain('input: Partial<z.infer<typeof blogPostFields>>,');
  });

  it('ships empty, because the blueprint cannot know a cross-field rule', () => {
    const body = dto.slice(
      dto.indexOf('function checkBlogPost('),
      dto.indexOf('export const createBlogPostSchema'),
    );

    expect(body).toContain('void input;');
    expect(body).not.toContain('addIssue(');
  });
});
