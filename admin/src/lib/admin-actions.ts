import { ApiError, api } from './api';
import type {
  AdminActionMeta,
  AdminField,
  AdminSection,
  DescribedController,
} from './api';
import type { AdminExtensions, RowAction } from './extensions';
import { buildForm } from './form';
import { payloadOf, validate } from './form-schema';
import type { FormField, FormValues } from './form-schema';
import { dialogOf, present } from './resource-editor';

export interface AdminActionRoute {
  meta: AdminActionMeta;
  method: string;
  // The controller's base plus the route's own path, with any `:id` intact.
  path: string;
}

export interface ActionTarget {
  row?: Record<string, unknown>;
  ids?: string[];
}

export interface ActionOutcome {
  ok: boolean;
  message: string;
}

export function actionsOf(
  controllers: DescribedController[],
): AdminActionRoute[] {
  return controllers.flatMap((controller) =>
    controller.routes.flatMap((route) =>
      route.admin?.kind === 'action'
        ? [
            {
              meta: route.admin,
              method: route.method,
              path:
                route.path === '/'
                  ? controller.basePath
                  : controller.basePath + route.path,
            },
          ]
        : [],
    ),
  );
}

export function actionsForSection(
  actions: AdminActionRoute[],
  section: AdminSection,
  scope: AdminActionMeta['scope'],
): AdminActionRoute[] {
  return actions.filter(
    (action) =>
      action.meta.scope === scope &&
      section.id !== undefined &&
      action.meta.section === section.id,
  );
}

/**
 * The actions a resource page can offer on a row: the ones declared for the
 * section that lists that resource. The resource page knows its base, not a
 * section id, so the two are joined on the list route.
 */
export function rowActionsForBase(
  controllers: DescribedController[],
  base: string,
): AdminActionRoute[] {
  const sectionIds = controllers.flatMap((controller) =>
    controller.routes.flatMap((route) => {
      const path =
        route.path === '/'
          ? controller.basePath
          : controller.basePath + route.path;

      return route.admin?.kind === 'section' &&
        (path === base || path === base + '/search')
        ? [route.admin.id]
        : [];
    }),
  );

  return actionsOf(controllers).filter(
    (action) =>
      action.meta.scope === 'row' &&
      action.meta.section !== undefined &&
      sectionIds.includes(action.meta.section),
  );
}

export function pathOf(action: AdminActionRoute, target: ActionTarget): string {
  const id = target.row?.id;

  return action.path.replace(':id', encodeURIComponent(String(id ?? '')));
}

const KIND_BY_TYPE = {
  text: 'text',
  textarea: 'text',
  password: 'text',
  number: 'number',
  boolean: 'checkbox',
  select: 'select',
} as const;

export function formFieldsOfAction(fields: AdminField[]): FormField[] {
  return fields.map((field) => ({
    name: field.name,
    label: field.label,
    kind: KIND_BY_TYPE[field.type],
    required: field.required === true,
    integer: false,
    readonly: false,
    help: field.help,
    options: field.options,
    secret: field.type === 'password',
  }));
}

export function bodyOf(
  action: AdminActionRoute,
  target: ActionTarget,
  values: FormValues,
): Record<string, unknown> {
  const payload = payloadOf(
    formFieldsOfAction(action.meta.fields ?? []),
    values,
    {},
    'create',
  );

  return action.meta.scope === 'bulk'
    ? { ...payload, ids: target.ids ?? [] }
    : payload;
}

function failureOf(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'You are not allowed to do this.';
    }

    return error.serverMessage ?? 'The request failed (' + error.status + ').';
  }

  return 'The request failed.';
}

export async function sendAction(
  action: AdminActionRoute,
  target: ActionTarget,
  values: FormValues = {},
): Promise<ActionOutcome> {
  try {
    await api<unknown>(pathOf(action, target), {
      method: action.method,
      body: JSON.stringify(bodyOf(action, target, values)),
    });

    return { ok: true, message: action.meta.title + ': done.' };
  } catch (error) {
    return { ok: false, message: failureOf(error) };
  }
}

/**
 * Asks only as much as the action needs: a plain action runs at once, one that
 * declared a confirmation or is dangerous asks first, one with fields collects
 * them. What it asks is read from the declaration, so a feature never ships
 * its own dialog, and the answer is the API's: a refusal is shown, never
 * hidden behind a button that looked enabled.
 */
export function runAdminAction(
  root: HTMLElement,
  action: AdminActionRoute,
  target: ActionTarget,
): Promise<ActionOutcome | null> {
  const { meta } = action;
  const fields = formFieldsOfAction(meta.fields ?? []);
  const needsDialog =
    fields.length > 0 || meta.confirm !== undefined || meta.danger === true;

  if (!needsDialog) {
    return sendAction(action, target);
  }

  return new Promise((resolve) => {
    const { dialog, body, close } = dialogOf(meta.title);
    let settled = false;
    const finish = (outcome: ActionOutcome | null): void => {
      if (!settled) {
        settled = true;
        close();
        resolve(outcome);
      }
    };

    dialog.addEventListener('close', () => finish(null));
    dialog.addEventListener('cancel', () => finish(null));

    const sentence = document.createElement('p');
    sentence.textContent =
      meta.confirm ??
      (meta.scope === 'bulk'
        ? meta.title + ' on ' + (target.ids?.length ?? 0) + ' selected rows?'
        : meta.title + '?');
    body.appendChild(sentence);

    const handle = buildForm({
      fields,
      initial: Object.fromEntries(
        fields.map((field) => [
          field.name,
          field.kind === 'checkbox' ? false : '',
        ]),
      ),
      submitLabel: meta.title,
      onCancel: () => finish(null),
      onSubmit: async (values) => {
        handle.showFailure([]);
        const errors = validate(fields, values);
        handle.showErrors(errors);

        if (Object.keys(errors).length > 0) {
          return;
        }

        handle.setBusy(true);
        const outcome = await sendAction(action, target, values);
        handle.setBusy(false);

        if (outcome.ok) {
          finish(outcome);
        } else {
          handle.showFailure([outcome.message]);
        }
      },
    });

    body.appendChild(handle.element);
    present(root, dialog);
  });
}

/**
 * The page's extensions plus the row actions features declared for this
 * resource. A hand-written extension with the same id wins, so an installation
 * can always override what a feature shipped.
 */
export function withContributions(
  extensions: AdminExtensions,
  controllers: DescribedController[],
  base: string,
  root: HTMLElement,
): AdminExtensions {
  const existing = extensions.resources?.[base] ?? {};
  const own = existing.rowActions ?? [];
  const contributed: RowAction[] = rowActionsForBase(controllers, base)
    .filter(
      (action) => !own.some((candidate) => candidate.id === action.meta.id),
    )
    .map((action) => ({
      id: action.meta.id,
      label: action.meta.title,
      run: async (row, { reload }) => {
        const outcome = await runAdminAction(root, action, { row });

        if (outcome?.ok) {
          await reload();
        }
      },
    }));

  return {
    ...extensions,
    resources: {
      ...extensions.resources,
      [base]: { ...existing, rowActions: [...own, ...contributed] },
    },
  };
}
