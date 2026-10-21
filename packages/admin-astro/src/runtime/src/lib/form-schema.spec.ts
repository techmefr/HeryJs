import { describe, expect, it } from 'vitest';
import {
  formFieldsOf,
  humanize,
  payloadOf,
  toLocalInput,
  validate,
  valuesOf,
} from './form-schema';
import { mockDescription, mockRow } from './resource.fixture';

const createFields = formFieldsOf(mockDescription, 'create');
const updateFields = formFieldsOf(mockDescription, 'update');

describe('form fields from the described rules', () => {
  it('builds one field per writable field, typed from the description', () => {
    expect(createFields.map((field) => [field.name, field.kind])).toEqual([
      ['title', 'text'],
      ['views', 'number'],
      ['isPublished', 'checkbox'],
      ['publishedAt', 'datetime'],
    ]);
  });

  it('marks required what the create rules require, and nothing on update', () => {
    expect(createFields.find((f) => f.name === 'title')?.required).toBe(true);
    expect(createFields.find((f) => f.name === 'views')?.required).toBe(false);
    expect(updateFields.every((field) => !field.required)).toBe(true);
  });

  it('carries the length and drops the safe integer bounds nobody typed', () => {
    const title = createFields.find((f) => f.name === 'title');
    const views = createFields.find((f) => f.name === 'views');

    expect(title?.minLength).toBe(1);
    expect(title?.maxLength).toBe(255);
    expect(views?.minimum).toBeUndefined();
    expect(views?.integer).toBe(true);
  });

  it('skips a field the rules do not accept', () => {
    const narrowed = {
      ...mockDescription,
      rules: {
        ...mockDescription.rules,
        create: {
          properties: { title: { type: 'string' } },
          required: ['title'],
        },
      },
    };

    expect(formFieldsOf(narrowed, 'create').map((field) => field.name)).toEqual(
      ['title'],
    );
  });

  it('turns an enum into a select', () => {
    const withEnum = {
      ...mockDescription,
      rules: {
        ...mockDescription.rules,
        create: {
          properties: { title: { type: 'string', enum: ['a', 'b'] } },
        },
      },
    };

    const [field] = formFieldsOf(withEnum, 'create');

    expect(field?.kind).toBe('select');
    expect(field?.options).toEqual(['a', 'b']);
  });

  it('humanizes a camel case name', () => {
    expect(humanize('isPublished')).toBe('Is published');
  });
});

describe('overrides on a form', () => {
  it('relabels and hides an optional field', () => {
    const fields = formFieldsOf(mockDescription, 'create', {
      views: { hidden: true },
      title: { label: 'Headline', help: 'Shown on the front page' },
    });

    expect(fields.map((field) => field.name)).not.toContain('views');
    expect(fields[0]?.label).toBe('Headline');
    expect(fields[0]?.help).toBe('Shown on the front page');
  });

  it('refuses to hide or lock a required field, since the api would refuse the record', () => {
    const fields = formFieldsOf(mockDescription, 'create', {
      title: { hidden: true, readonly: true },
    });

    const title = fields.find((field) => field.name === 'title');

    expect(title).toBeDefined();
    expect(title?.readonly).toBe(false);
  });

  it('locks an optional field', () => {
    const fields = formFieldsOf(mockDescription, 'update', {
      views: { readonly: true },
    });

    expect(fields.find((field) => field.name === 'views')?.readonly).toBe(true);
  });
});

describe('client validation mirrors the server rules', () => {
  it('requires a required field, and counts a blank as present like the server does', () => {
    expect(validate(createFields, { title: '' })).toEqual({
      title: 'Required',
    });
    expect(validate(createFields, { title: '   ' })).toEqual({});
  });

  it('enforces the length bounds', () => {
    expect(validate(createFields, { title: 'x'.repeat(256) }).title).toBe(
      'At most 255 characters',
    );
  });

  it('refuses a fraction where an integer is required', () => {
    expect(validate(createFields, { title: 'a', views: '1.5' }).views).toBe(
      'Must be a whole number',
    );
    expect(validate(createFields, { title: 'a', views: 'abc' }).views).toBe(
      'Must be a number',
    );
  });

  it('applies a minimum and a maximum', () => {
    const bounded = formFieldsOf(
      {
        ...mockDescription,
        rules: {
          ...mockDescription.rules,
          create: {
            properties: { views: { type: 'integer', minimum: 1, maximum: 5 } },
          },
        },
      },
      'create',
    );

    expect(validate(bounded, { views: '0' }).views).toBe('At least 1');
    expect(validate(bounded, { views: '6' }).views).toBe('At most 5');
    expect(validate(bounded, { views: '3' })).toEqual({});
  });

  it('applies a pattern and ignores one it cannot compile', () => {
    const patterned = (pattern: string) =>
      formFieldsOf(
        {
          ...mockDescription,
          rules: {
            ...mockDescription.rules,
            create: { properties: { title: { type: 'string', pattern } } },
          },
        },
        'create',
      );

    expect(validate(patterned('^a+$'), { title: 'b' }).title).toBe(
      'Does not match the expected format',
    );
    expect(validate(patterned('^a+$'), { title: 'aa' })).toEqual({});
    expect(validate(patterned('('), { title: 'b' })).toEqual({});
  });

  it('refuses a date it cannot read', () => {
    expect(
      validate(createFields, { title: 'a', publishedAt: 'not a date' })
        .publishedAt,
    ).toBe('Not a valid date');
  });

  it('refuses a value outside an enum', () => {
    const [field] = formFieldsOf(
      {
        ...mockDescription,
        rules: {
          ...mockDescription.rules,
          create: { properties: { title: { enum: ['a', 'b'] } } },
        },
      },
      'create',
    );

    expect(validate([field!], { title: 'c' }).title).toBe(
      'Not an allowed value',
    );
  });

  it('does not let an update empty a field, which the server cannot represent', () => {
    const initial = valuesOf(updateFields, mockRow('1', 'Hello'));
    const values = { ...initial, title: '' };

    expect(validate(updateFields, values, initial).title).toBe(
      'Cannot be cleared once set',
    );
  });
});

describe('the payload', () => {
  it('converts values to the types the server parses', () => {
    const payload = payloadOf(
      createFields,
      {
        title: 'Hello',
        views: '7',
        isPublished: true,
        publishedAt: '2026-01-02T03:04',
      },
      {},
      'create',
    );

    expect(payload.title).toBe('Hello');
    expect(payload.views).toBe(7);
    expect(payload.isPublished).toBe(true);
    expect(payload.publishedAt).toBe(
      new Date('2026-01-02T03:04').toISOString(),
    );
  });

  it('omits an empty optional field on create instead of sending an empty string', () => {
    const payload = payloadOf(
      createFields,
      { title: 'Hello', views: '', isPublished: false, publishedAt: '' },
      {},
      'create',
    );

    expect(payload).toEqual({ title: 'Hello', isPublished: false });
  });

  it('sends only what changed on update', () => {
    const initial = valuesOf(updateFields, mockRow('1', 'Hello'));
    const payload = payloadOf(
      updateFields,
      { ...initial, title: 'Hello again' },
      initial,
      'update',
    );

    expect(payload).toEqual({ title: 'Hello again' });
  });

  it('never sends a locked field', () => {
    const fields = formFieldsOf(mockDescription, 'update', {
      views: { readonly: true },
    });
    const initial = valuesOf(fields, mockRow('1', 'Hello'));

    expect(
      payloadOf(fields, { ...initial, views: '99' }, initial, 'update'),
    ).toEqual({});
  });
});

describe('initial values', () => {
  it('fills a form from a row, booleans and nulls included', () => {
    expect(
      valuesOf(createFields, {
        id: '1',
        title: 'Hello',
        views: null,
        isPublished: true,
      }),
    ).toEqual({
      title: 'Hello',
      views: '',
      isPublished: true,
      publishedAt: '',
    });
  });

  it('starts empty for a new record', () => {
    expect(valuesOf(createFields, null)).toEqual({
      title: '',
      views: '',
      isPublished: false,
      publishedAt: '',
    });
  });

  it('shows a timestamp in local time for a datetime input', () => {
    const iso = '2026-01-02T03:04:00.000Z';
    const local = toLocalInput(iso);

    expect(new Date(local).toISOString()).toBe(
      new Date(new Date(iso).setSeconds(0, 0)).toISOString(),
    );
    expect(toLocalInput('garbage')).toBe('');
    expect(toLocalInput(null)).toBe('');
  });
});
