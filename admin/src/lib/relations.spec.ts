import { describe, expect, it } from 'vitest';
import {
  childRelationsOf,
  childResourceBase,
  childSearchPath,
  idsError,
  idsOf,
  parseIds,
  relationBody,
} from './relations';
import { mockControllers } from './resource.fixture';

describe('ids typed by a person', () => {
  it('splits on commas and whitespace and drops duplicates and blanks', () => {
    expect(parseIds('a, b  c,,a\n d')).toEqual(['a', 'b', 'c', 'd']);
    expect(parseIds('  ')).toEqual([]);
  });

  it('needs an id to attach or detach, but not to replace with nothing', () => {
    expect(idsError([], 'attach')).toBe('Give at least one id');
    expect(idsError([], 'detach')).toBe('Give at least one id');
    expect(idsError([], 'sync')).toBeNull();
    expect(idsError(['a'], 'attach')).toBeNull();
  });

  it('refuses more ids than one request may carry', () => {
    const many = Array.from({ length: 101 }, (_, index) => 'id-' + index);

    expect(idsError(many, 'sync')).toBe('At most 100 ids at once');
  });

  it('builds the update body the api documents', () => {
    expect(relationBody('p1', 'tags', 'sync', ['t1'])).toEqual({
      data: [{ id: 'p1', relations: { tags: { sync: ['t1'] } } }],
    });
  });

  it('keeps only string ids from an answer', () => {
    expect(idsOf(['a', 1, null, 'b'])).toEqual(['a', 'b']);
    expect(idsOf('a')).toEqual([]);
  });
});

describe('children of a record', () => {
  it('finds the own-route child searches a controller declares', () => {
    expect(childRelationsOf(mockControllers, '/blog-posts')).toEqual(['notes']);
    expect(childRelationsOf(mockControllers, '/nowhere')).toEqual([]);
  });

  it('addresses the child search under its parent, escaping the id', () => {
    expect(childSearchPath('/blog-posts', 'a/b', 'notes')).toBe(
      '/blog-posts/a%2Fb/notes/search',
    );
  });

  it('finds the resource a child delegate belongs to, whatever its plural', () => {
    const bases = ['/blog-post-notes', '/categories', '/boxes'];

    expect(childResourceBase('blogPostNote', bases)).toBe('/blog-post-notes');
    expect(childResourceBase('category', bases)).toBe('/categories');
    expect(childResourceBase('box', bases)).toBe('/boxes');
    expect(childResourceBase('comment', bases)).toBeNull();
    expect(childResourceBase(undefined, bases)).toBeNull();
  });
});
