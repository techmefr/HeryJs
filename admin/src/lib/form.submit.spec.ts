import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { buildForm } from './form';
import { formFieldsOf, valuesOf } from './form-schema';
import { mockDescription } from './resource.fixture';

const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('form submission', () => {
  it('shows a rejected submission and frees the form instead of losing the error', async () => {
    const fields = formFieldsOf(mockDescription, 'create');
    const handle = buildForm({
      fields,
      initial: valuesOf(fields, null),
      submitLabel: 'Save',
      onSubmit: async () => {
        handle.setBusy(true);
        await Promise.resolve();
        throw new ApiError('refused', 500, null, 'Server exploded');
      },
      onCancel: () => undefined,
    });
    document.body.replaceChildren(handle.element);

    handle.element.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    await settle();
    await settle();

    expect(handle.element.textContent).toContain('Server exploded');
    expect(
      handle.element.querySelector<HTMLButtonElement>('button[type="submit"]')!
        .disabled,
    ).toBe(false);
  });
});
