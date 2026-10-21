import { Prisma } from '@prisma/client';
import {
  anonymisedData,
  eraseOrder,
  ERASED_TEXT,
  PersonalDataRegistry,
} from './personal-data.registry';
import type {
  PersonalDataDeclaration,
  PersonalDataField,
} from './personal-data.types';

function field(overrides: Partial<PersonalDataField>): PersonalDataField {
  return {
    name: 'value',
    type: 'string',
    optional: false,
    translatable: false,
    personal: true,
    ...overrides,
  };
}

describe('anonymisedData', () => {
  it('rewrites only the personal fields, to the emptiest value each allows', () => {
    const declaration: PersonalDataDeclaration = {
      model: 'Note',
      erase: 'anonymise',
      fields: [
        field({ name: 'title' }),
        field({ name: 'count', type: 'int' }),
        field({ name: 'flag', type: 'boolean' }),
        field({ name: 'sealed', type: 'encrypted', optional: true }),
        field({ name: 'summary', optional: true, translatable: true }),
        field({ name: 'kept', personal: false }),
      ],
    };

    expect(anonymisedData(declaration)).toEqual({
      title: ERASED_TEXT,
      count: 0,
      flag: false,
      sealed: null,
      summary: Prisma.DbNull,
    });
  });
});

describe('eraseOrder', () => {
  it('erases a model that points at another before the one it points at', () => {
    const declarations: PersonalDataDeclaration[] = [
      { model: 'BlogPost', erase: 'delete', fields: [] },
      { model: 'BlogPostNote', erase: 'delete', fields: [] },
    ];

    expect(eraseOrder(declarations).map((entry) => entry.model)).toEqual([
      'BlogPostNote',
      'BlogPost',
    ]);
  });
});

describe('PersonalDataRegistry', () => {
  it('keeps one declaration per model', () => {
    const registry = new PersonalDataRegistry();

    registry.register({ model: 'Snippet', erase: 'delete', fields: [] });
    registry.register({ model: 'Snippet', erase: 'anonymise', fields: [] });

    expect(registry.all()).toEqual([
      { model: 'Snippet', erase: 'anonymise', fields: [] },
    ]);
  });
});
