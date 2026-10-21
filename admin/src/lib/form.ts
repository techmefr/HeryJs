import type { FormField, FormValue, FormValues } from './form-schema';

export interface FormHandle {
  element: HTMLFormElement;
  values: () => FormValues;
  showErrors: (errors: Record<string, string>) => void;
  showFailure: (messages: string[]) => void;
  setBusy: (isBusy: boolean) => void;
}

export interface FormOptions {
  fields: FormField[];
  initial: FormValues;
  submitLabel: string;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
}

const TEXT_INPUT_TYPES = {
  text: 'text',
  number: 'number',
  datetime: 'datetime-local',
} as const;

function controlOf(
  field: FormField,
  id: string,
  value: FormValue,
): HTMLElement {
  if (field.kind === 'select') {
    const select = document.createElement('select');
    select.id = id;
    select.append(new Option('', ''));

    for (const option of field.options ?? []) {
      select.append(new Option(option, option));
    }

    select.value = String(value);

    return select;
  }

  const input = document.createElement('input');
  input.id = id;
  input.name = field.name;

  if (field.kind === 'checkbox') {
    input.type = 'checkbox';
    input.checked = value === true;
    return input;
  }

  input.type = TEXT_INPUT_TYPES[field.kind];
  input.value = String(value);

  if (field.maxLength !== undefined) {
    input.maxLength = field.maxLength;
  }

  if (field.kind === 'number') {
    input.step = field.integer ? '1' : 'any';

    if (field.minimum !== undefined) {
      input.min = String(field.minimum);
    }

    if (field.maximum !== undefined) {
      input.max = String(field.maximum);
    }
  }

  return input;
}

function valueOf(field: FormField, control: HTMLElement): FormValue {
  if (control instanceof HTMLInputElement && field.kind === 'checkbox') {
    return control.checked;
  }

  return (control as HTMLInputElement | HTMLSelectElement).value;
}

function rowOf(
  field: FormField,
  value: FormValue,
  index: number,
): { row: HTMLElement; control: HTMLElement; error: HTMLElement } {
  const row = document.createElement('div');
  row.className = 'form-row';

  const id = 'field-' + index + '-' + field.name;
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = field.label + (field.required ? ' *' : '');

  const control = controlOf(field, id, value);

  if (field.readonly) {
    control.setAttribute('disabled', '');
  }

  const error = document.createElement('p');
  error.className = 'form-error';
  error.id = id + '-error';
  error.hidden = true;
  control.setAttribute('aria-describedby', error.id);

  row.append(label, control);

  row.appendChild(error);

  return { row, control, error };
}

export function buildForm(options: FormOptions): FormHandle {
  const element = document.createElement('form');
  element.noValidate = true;

  const failure = document.createElement('div');
  failure.className = 'form-failure';
  failure.setAttribute('role', 'alert');
  failure.hidden = true;
  element.appendChild(failure);

  const controls = new Map<string, HTMLElement>();
  const errors = new Map<string, HTMLElement>();

  options.fields.forEach((field, index) => {
    const built = rowOf(field, options.initial[field.name] ?? '', index);
    controls.set(field.name, built.control);
    errors.set(field.name, built.error);
    element.appendChild(built.row);
  });

  const actions = document.createElement('div');
  actions.className = 'form-actions';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'primary';
  submit.textContent = options.submitLabel;

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', options.onCancel);

  actions.append(submit, cancel);
  element.appendChild(actions);

  const values = (): FormValues =>
    Object.fromEntries(
      options.fields.map((field) => [
        field.name,
        valueOf(field, controls.get(field.name)!),
      ]),
    );

  element.addEventListener('submit', (event) => {
    event.preventDefault();
    options.onSubmit(values());
  });

  return {
    element,
    values,
    showErrors(found) {
      for (const field of options.fields) {
        const message = found[field.name];
        const target = errors.get(field.name)!;
        const control = controls.get(field.name)!;
        target.hidden = message === undefined;
        target.textContent = message ?? '';
        control.setAttribute('aria-invalid', String(message !== undefined));
      }
    },
    showFailure(messages) {
      failure.hidden = messages.length === 0;
      failure.replaceChildren(
        ...messages.map((message) => {
          const line = document.createElement('p');
          line.textContent = message;
          return line;
        }),
      );
    },
    setBusy(isBusy) {
      submit.disabled = isBusy;
      cancel.disabled = isBusy;
    },
  };
}
