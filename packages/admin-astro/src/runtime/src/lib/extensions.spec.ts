import { describe, expect, it } from 'vitest';
import {
  defineExtensions,
  extensionFor,
  extraCapabilityKeys,
  isDisabled,
  requiredButHidden,
  unknownOverrides,
} from './extensions';
import { mockDescription } from './resource.fixture';

describe('the extension registry', () => {
  it('returns the definition untouched', () => {
    const definition = { resources: { '/blog-posts': { label: 'Posts' } } };

    expect(defineExtensions(definition)).toBe(definition);
  });

  it('gives an empty extension to a resource nobody customised', () => {
    expect(extensionFor({}, '/blog-posts')).toEqual({});
    expect(
      extensionFor(
        { resources: { '/blog-posts': { label: 'Posts' } } },
        '/blog-posts',
      ).label,
    ).toBe('Posts');
  });

  it('only disables what it names', () => {
    expect(isDisabled({ disable: ['bulk'] }, 'bulk')).toBe(true);
    expect(isDisabled({ disable: ['bulk'] }, 'create')).toBe(false);
    expect(isDisabled({}, 'create')).toBe(false);
  });

  it('collects the capabilities custom actions need resolved', () => {
    expect(
      extraCapabilityKeys({
        rowActions: [
          { id: 'a', label: 'A', capability: 'feature', run: () => undefined },
          { id: 'b', label: 'B', run: () => undefined },
        ],
      }),
    ).toEqual(['feature']);
  });
});

describe('overrides that no longer match the api', () => {
  it('names fields and columns the description does not know', () => {
    expect(
      unknownOverrides(
        {
          fields: { title: {}, gone: {} },
          columns: { id: {}, selected: {}, gone: {}, views: {} },
        },
        mockDescription,
      ),
    ).toEqual(['gone', 'selected']);
  });

  it('names a required field an override tries to hide or lock', () => {
    expect(
      requiredButHidden(
        { fields: { title: { hidden: true } } },
        mockDescription,
      ),
    ).toEqual(['title']);
    expect(
      requiredButHidden(
        { fields: { title: { label: 'Headline' } } },
        mockDescription,
      ),
    ).toEqual([]);
    expect(
      requiredButHidden(
        { fields: { views: { hidden: true } } },
        mockDescription,
      ),
    ).toEqual([]);
  });
});
