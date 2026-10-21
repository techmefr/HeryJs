import { describe, expect, it } from 'vitest';
import {
  childRelationsOf,
  childResourceBase,
  childSearchPath,
  labelOfRelated,
  relationBody,
} from './relations';
import { mockControllers } from './resource.fixture';

describe('relation requests', () => {
  it('builds the update body the api documents', () => {
    expect(relationBody('p1', 'tags', 'attach', ['t1'])).toEqual({
      data: [{ id: 'p1', relations: { tags: { attach: ['t1'] } } }],
    });
  });

  it('labels a related row by its first text field and its id', () => {
    expect(labelOfRelated({ id: 't1', name: 'Red' })).toBe('Red (t1)');
    expect(labelOfRelated({ id: 't1', count: 3 })).toBe('t1');
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
