import { describe, expect, it } from 'vitest';
import { buildForm } from './form';
import { formFieldsOf, payloadOf, valuesOf } from './form-schema';
import { mockDescription } from './resource.fixture';
import type { ResourceDescription } from './resource';

const withSlug = (stable: boolean): ResourceDescription => ({
  ...mockDescription,
  fields: [
    mockDescription.fields[0]!,
    {
      name: 'slug',
      type: 'slug',
      optional: false,
      slug: { source: 'title', stable },
    },
  ],
  filters: ['id', 'title', 'slug'],
  rules: {
    create: {
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 255 },
        slug: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
        },
      },
      required: ['title'],
    },
    update: {
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 255 },
        slug: { type: 'string', minLength: 1, maxLength: 100 },
      },
    },
  },
});

function mount(description: ResourceDescription, mode: 'create' | 'update') {
  const fields = formFieldsOf(description, mode);
  const initial = valuesOf(
    fields,
    mode === 'update'
      ? { id: '1', title: 'Old title', slug: 'old-title' }
      : null,
  );
  const handle = buildForm({
    fields,
    initial,
    submitLabel: 'Save',
    onSubmit: () => undefined,
    onCancel: () => undefined,
  });
  document.body.replaceChildren(handle.element);

  return {
    fields,
    initial,
    handle,
    title: handle.element.querySelector<HTMLInputElement>('input[name=title]')!,
    slug: handle.element.querySelector<HTMLInputElement>('input[name=slug]')!,
    suggest: handle.element.querySelector<HTMLButtonElement>('.form-suggest')!,
  };
}

function type(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event('input'));
}

describe('a slug field in the form', () => {
  it('is a text input that keeps the pattern the API publishes', () => {
    const { fields } = mount(withSlug(false), 'create');
    const slug = fields.find((field) => field.name === 'slug');

    expect(slug?.kind).toBe('slug');
    expect(slug?.required).toBe(false);
    expect(slug?.pattern).toBe('^[a-z0-9]+(?:-[a-z0-9]+)*$');
    expect(slug?.slug).toEqual({ source: 'title', stable: false });
  });

  it('suggests a slug from the source while the person types it', () => {
    const { title, slug, suggest } = mount(withSlug(false), 'create');

    expect(suggest.hidden).toBe(true);

    type(title, 'Été à Paris !');

    expect(slug.placeholder).toBe('ete-a-paris');
    expect(slug.value).toBe('');
    expect(suggest.hidden).toBe(false);
  });

  it('fills the input from the suggestion on demand, and stops offering it', () => {
    const { title, slug, suggest } = mount(withSlug(false), 'create');

    type(title, 'My First Post');
    suggest.click();

    expect(slug.value).toBe('my-first-post');
    expect(suggest.hidden).toBe(true);
  });

  it('sends no slug when it is left empty, so the API derives and numbers it', () => {
    const { fields, initial, handle, title } = mount(withSlug(false), 'create');

    type(title, 'My First Post');

    expect(payloadOf(fields, handle.values(), initial, 'create')).toEqual({
      title: 'My First Post',
    });
  });

  it('explains what happens to the slug when the source changes on update', () => {
    const following = formFieldsOf(withSlug(false), 'update');
    const stable = formFieldsOf(withSlug(true), 'update');

    expect(following.find((f) => f.name === 'slug')?.help).toContain(
      'Follows Title',
    );
    expect(stable.find((f) => f.name === 'slug')?.help).toContain(
      'Kept when Title changes',
    );
  });

  it('shows the current slug on update and sends it only when it was edited', () => {
    const { fields, initial, handle, slug } = mount(withSlug(false), 'update');

    expect(slug.value).toBe('old-title');
    expect(payloadOf(fields, handle.values(), initial, 'update')).toEqual({});

    type(slug, 'renamed');

    expect(payloadOf(fields, handle.values(), initial, 'update')).toEqual({
      slug: 'renamed',
    });
  });

  it('rejects an invalid slug before anything is sent', async () => {
    const { validate } = await import('./form-schema');
    const { fields } = mount(withSlug(false), 'create');

    expect(validate(fields, { title: 'x', slug: 'Not A Slug' }).slug).toBe(
      'Does not match the expected format',
    );
    expect(validate(fields, { title: 'x', slug: 'fine-slug' }).slug).toBe(
      undefined,
    );
  });
});
