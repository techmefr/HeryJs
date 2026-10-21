import { describe, expect, it } from 'vitest';
import { buildForm } from './form';
import { formFieldsOf, payloadOf, valuesOf, validate } from './form-schema';
import { mockDescription } from './resource.fixture';
import type { ResourceDescription } from './resource';

const description: ResourceDescription = {
  ...mockDescription,
  fields: [
    mockDescription.fields[0]!,
    {
      name: 'body',
      type: 'richtext',
      optional: true,
      richtext: {
        maxLength: 50,
        allow: {
          tags: ['p', 'strong', 'a'],
          attributes: { a: ['href'] },
          schemes: ['https'],
        },
      },
    },
  ],
  filters: ['id', 'title'],
  rules: {
    create: {
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 255 },
        body: { type: 'string', minLength: 1, maxLength: 50 },
      },
      required: ['title'],
    },
    update: {
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 255 },
        body: { type: 'string', minLength: 1, maxLength: 50 },
      },
    },
  },
};

function mount() {
  const fields = formFieldsOf(description, 'create');
  const initial = valuesOf(fields, null);
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
    area: handle.element.querySelector<HTMLTextAreaElement>('textarea')!,
    preview: handle.element.querySelector<HTMLElement>('.form-preview-body')!,
    count: handle.element.querySelector<HTMLElement>('.form-preview p')!,
  };
}

function type(area: HTMLTextAreaElement, text: string): void {
  area.value = text;
  area.dispatchEvent(new Event('input'));
}

describe('a richtext field in the form', () => {
  it('is a textarea with a preview, and carries the limit and the allow-list', () => {
    const { fields, area } = mount();
    const body = fields.find((field) => field.name === 'body');

    expect(body?.kind).toBe('richtext');
    expect(body?.maxLength).toBe(50);
    expect(body?.richtext?.allow.tags).toEqual(['p', 'strong', 'a']);
    expect(area.maxLength).toBe(50);
  });

  it('previews what the allow-list keeps while the person types', () => {
    const { area, preview } = mount();

    type(area, '<p>a <strong>b</strong></p><script>window.pwned=1</script>');

    expect(preview.innerHTML).toBe('<p>a <strong>b</strong></p>');
    expect((window as { pwned?: number }).pwned).toBeUndefined();
  });

  it('never previews a payload as markup', () => {
    const { area, preview } = mount();

    type(
      area,
      '<img src=x onerror="window.pwned=1"><a href="javascript:1">x</a>',
    );

    expect(preview.querySelector('img')).toBeNull();
    expect(preview.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect((window as { pwned?: number }).pwned).toBeUndefined();
  });

  it('counts the characters against the limit', () => {
    const { area, count } = mount();

    type(area, '<p>hello</p>');

    expect(count.textContent).toBe('12 / 50 characters');
  });

  it('sends the HTML as typed, for the API to sanitise', () => {
    const { fields, initial, handle, area } = mount();
    const title =
      handle.element.querySelector<HTMLInputElement>('input[name=title]')!;
    title.value = 'T';
    type(area, '<p>x</p>');

    expect(payloadOf(fields, handle.values(), initial, 'create')).toEqual({
      title: 'T',
      body: '<p>x</p>',
    });
  });

  it('refuses more than the limit before anything is sent', () => {
    const { fields } = mount();

    expect(validate(fields, { title: 'T', body: 'a'.repeat(51) }).body).toBe(
      'At most 50 characters',
    );
  });
});
