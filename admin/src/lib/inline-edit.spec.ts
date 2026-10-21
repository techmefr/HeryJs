import { describe, expect, it, vi } from 'vitest';
import { attachInlineEdit } from './inline-edit';
import type { FormField } from './form-schema';

const field: FormField = {
  name: 'title',
  label: 'Title',
  kind: 'text',
  required: true,
  integer: false,
  readonly: false,
};

function mounted(commit: (...args: never[]) => Promise<string | null>) {
  document.body.replaceChildren();
  const cell = document.createElement('td');
  cell.textContent = 'Old';
  document.body.appendChild(cell);
  attachInlineEdit(cell, { id: '7' }, field, 'Old', commit as never);

  return cell;
}

const press = (control: Element, key: string) =>
  control.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

describe('inline edit', () => {
  it('offers a labelled button, reachable by keyboard', () => {
    const cell = mounted(() => Promise.resolve(null));

    expect(cell.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Edit Title of 7',
    );
  });

  it('sends the typed value on Enter', async () => {
    const commit = vi.fn(() => Promise.resolve(null));
    const cell = mounted(commit);

    cell.querySelector('button')?.click();
    const input = cell.querySelector('input') as HTMLInputElement;
    input.value = 'New';
    press(input, 'Enter');

    expect(commit).toHaveBeenCalledWith({ id: '7' }, field, 'New');
  });

  it('puts the cell back on Escape without sending anything', () => {
    const commit = vi.fn(() => Promise.resolve(null));
    const cell = mounted(commit);

    cell.querySelector('button')?.click();
    press(cell.querySelector('input')!, 'Escape');

    expect(commit).not.toHaveBeenCalled();
    expect(cell.querySelector('input')).toBeNull();
    expect(cell.textContent).toContain('Old');
  });

  it('keeps the control open and shows the refusal next to it', async () => {
    const commit = vi.fn(() => Promise.resolve('Too short'));
    const cell = mounted(commit);

    cell.querySelector('button')?.click();
    press(cell.querySelector('input')!, 'Enter');
    await vi.waitFor(() =>
      expect(cell.querySelector('[role="alert"]')?.textContent).toBe(
        'Too short',
      ),
    );

    expect(cell.querySelector('input')).not.toBeNull();
  });
});
