import { ScimException } from './scim.exception';
import { SCIM_PATCH_SCHEMA } from './scim.types';

export interface ScimPatchOperation {
  op: 'add' | 'remove' | 'replace';
  path: string | null;
  value: unknown;
}

export interface ScimUserState {
  userName: string;
  externalId: string | null;
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
  isActive: boolean;
}

export interface ScimGroupState {
  displayName: string;
  externalId: string | null;
  memberIds: string[];
}

const CORE_USER_PREFIX = 'urn:ietf:params:scim:schemas:core:2.0:user:';
const CORE_GROUP_PREFIX = 'urn:ietf:params:scim:schemas:core:2.0:group:';
const MEMBER_PATH = /^members\[\s*value\s+eq\s+"([^"]*)"\s*\]$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePatchRequest(body: unknown): ScimPatchOperation[] {
  if (!isRecord(body)) {
    throw ScimException.badRequest('A PatchOp body is required.', 'invalidSyntax');
  }

  const schemas = body.schemas;
  const operations = body.Operations ?? body.operations;

  if (!Array.isArray(schemas) || !schemas.includes(SCIM_PATCH_SCHEMA)) {
    throw ScimException.badRequest(
      `schemas must include ${SCIM_PATCH_SCHEMA}.`,
      'invalidSyntax',
    );
  }

  if (!Array.isArray(operations) || operations.length === 0) {
    throw ScimException.badRequest(
      'Operations must be a non-empty array.',
      'invalidSyntax',
    );
  }

  return operations.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.op !== 'string') {
      throw ScimException.badRequest('Every operation needs an op.', 'invalidSyntax');
    }

    const op = entry.op.toLowerCase();

    if (op !== 'add' && op !== 'remove' && op !== 'replace') {
      throw ScimException.badRequest(`Unknown op "${entry.op}".`, 'invalidSyntax');
    }

    return {
      op,
      path: typeof entry.path === 'string' && entry.path !== '' ? entry.path : null,
      value: entry.value,
    };
  });
}

/** Azure AD sends booleans as the strings "True" and "False". */
export function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string' && /^(true|false)$/i.test(value)) {
    return value.toLowerCase() === 'true';
  }

  throw ScimException.badRequest('Expected a boolean.', 'invalidValue');
}

function toText(value: unknown): string {
  if (typeof value !== 'string') {
    throw ScimException.badRequest('Expected a string.', 'invalidValue');
  }

  return value;
}

function toNullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : toText(value);
}

function attributeOf(path: string, prefix: string): string {
  const lower = path.toLowerCase();

  return lower.startsWith(prefix) ? lower.slice(prefix.length) : lower;
}

function setUserAttribute(
  state: ScimUserState,
  path: string,
  value: unknown,
): void {
  if (path.startsWith('urn:') && !path.toLowerCase().startsWith(CORE_USER_PREFIX)) {
    return;
  }

  switch (attributeOf(path, CORE_USER_PREFIX)) {
    case 'username':
      state.userName = toText(value);
      break;
    case 'externalid':
      state.externalId = toNullableText(value);
      break;
    case 'displayname':
      state.displayName = toNullableText(value);
      break;
    case 'active':
      state.isActive = toBoolean(value);
      break;
    case 'name.givenname':
      state.givenName = toNullableText(value);
      break;
    case 'name.familyname':
      state.familyName = toNullableText(value);
      break;
    case 'name':
      if (isRecord(value)) {
        for (const [key, inner] of Object.entries(value)) {
          setUserAttribute(state, `name.${key}`, inner);
        }
      }
      break;
    default:
      // Attributes this service does not store (emails mirror userName, and
      // enterprise-extension attributes are not kept) are accepted and ignored,
      // which is what a directory expects of a server that does not model them.
      break;
  }
}

export function applyUserPatch(
  current: ScimUserState,
  operations: ScimPatchOperation[],
): ScimUserState {
  const state = { ...current };

  for (const operation of operations) {
    if (operation.op === 'remove') {
      if (!operation.path) {
        throw ScimException.badRequest('remove needs a path.', 'noTarget');
      }

      const attribute = attributeOf(operation.path, CORE_USER_PREFIX);

      if (attribute === 'username' || attribute === 'active') {
        throw ScimException.badRequest(
          `${operation.path} cannot be removed.`,
          'mutability',
        );
      }

      setUserAttribute(state, operation.path, null);
      continue;
    }

    if (operation.path) {
      setUserAttribute(state, operation.path, operation.value);
    } else if (isRecord(operation.value)) {
      for (const [key, value] of Object.entries(operation.value)) {
        setUserAttribute(state, key, value);
      }
    } else {
      throw ScimException.badRequest('An operation without a path needs an object value.', 'invalidValue');
    }
  }

  return state;
}

function memberIdsOf(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw ScimException.badRequest('members must be an array.', 'invalidValue');
  }

  return value.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.value !== 'string') {
      throw ScimException.badRequest('A member needs a value.', 'invalidValue');
    }

    return entry.value;
  });
}

function setGroupAttribute(
  state: ScimGroupState,
  op: 'add' | 'replace',
  path: string,
  value: unknown,
): void {
  if (path.startsWith('urn:') && !path.toLowerCase().startsWith(CORE_GROUP_PREFIX)) {
    return;
  }

  switch (attributeOf(path, CORE_GROUP_PREFIX)) {
    case 'displayname':
      state.displayName = toText(value);
      break;
    case 'externalid':
      state.externalId = toNullableText(value);
      break;
    case 'members': {
      const ids = memberIdsOf(value);

      state.memberIds =
        op === 'replace' ? [...new Set(ids)] : [...new Set([...state.memberIds, ...ids])];
      break;
    }
    default:
      break;
  }
}

export function applyGroupPatch(
  current: ScimGroupState,
  operations: ScimPatchOperation[],
): ScimGroupState {
  const state = { ...current, memberIds: [...current.memberIds] };

  for (const operation of operations) {
    if (operation.op === 'remove') {
      const path = operation.path;

      if (!path) {
        throw ScimException.badRequest('remove needs a path.', 'noTarget');
      }

      const single = MEMBER_PATH.exec(path);

      if (single) {
        state.memberIds = state.memberIds.filter((id) => id !== single[1]);
      } else if (path.toLowerCase() === 'members') {
        const removed =
          operation.value === undefined ? null : new Set(memberIdsOf(operation.value));

        state.memberIds = removed
          ? state.memberIds.filter((id) => !removed.has(id))
          : [];
      } else {
        throw ScimException.badRequest(`${path} cannot be removed.`, 'mutability');
      }

      continue;
    }

    if (operation.path) {
      setGroupAttribute(state, operation.op, operation.path, operation.value);
    } else if (isRecord(operation.value)) {
      for (const [key, value] of Object.entries(operation.value)) {
        setGroupAttribute(state, operation.op, key, value);
      }
    } else {
      throw ScimException.badRequest('An operation without a path needs an object value.', 'invalidValue');
    }
  }

  return state;
}
