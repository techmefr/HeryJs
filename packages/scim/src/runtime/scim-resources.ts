import { z } from 'zod';
import { ScimException } from './scim.exception';
import {
  SCIM_BASE_PATH,
  SCIM_GROUP_SCHEMA,
  SCIM_LIST_SCHEMA,
  SCIM_USER_SCHEMA,
} from './scim.types';
import type {
  ScimGroupInput,
  ScimGroupRow,
  ScimUserInput,
  ScimUserRow,
} from './scim.types';
import { toBoolean } from './scim-patch';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEXT = 255;
const MAX_MEMBERS = 5000;

const text = z.string().max(MAX_TEXT);

const userBodySchema = z.looseObject({
  userName: z.string().min(3).max(254),
  externalId: text.nullish(),
  displayName: text.nullish(),
  name: z
    .looseObject({
      givenName: text.nullish(),
      familyName: text.nullish(),
      formatted: text.nullish(),
    })
    .nullish(),
  active: z.union([z.boolean(), z.string()]).optional(),
});

const groupBodySchema = z.looseObject({
  displayName: z.string().min(1).max(MAX_TEXT),
  externalId: text.nullish(),
  members: z
    .array(z.looseObject({ value: z.string().min(1).max(MAX_TEXT) }))
    .max(MAX_MEMBERS)
    .optional(),
});

function invalid(error: z.ZodError): ScimException {
  const issue = error.issues[0];

  return ScimException.badRequest(
    issue
      ? `${issue.path.join('.') || 'body'}: ${issue.message}`
      : 'Invalid body.',
    'invalidValue',
  );
}

export function userInputFrom(state: {
  userName: string;
  externalId: string | null;
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
  isActive: boolean;
}): ScimUserInput {
  const email = state.userName.trim().toLowerCase();

  if (!EMAIL.test(email)) {
    throw ScimException.badRequest(
      'userName must be the email address the user signs in with.',
      'invalidValue',
    );
  }

  const composed = [state.givenName, state.familyName]
    .filter(Boolean)
    .join(' ');

  return {
    email,
    name: state.displayName ?? (composed || null),
    givenName: state.givenName,
    familyName: state.familyName,
    externalId: state.externalId,
    isActive: state.isActive,
  };
}

export function parseUserBody(body: unknown): ScimUserInput {
  const parsed = userBodySchema.safeParse(body);

  if (!parsed.success) {
    throw invalid(parsed.error);
  }

  const data = parsed.data;

  return userInputFrom({
    userName: data.userName,
    externalId: data.externalId ?? null,
    displayName: data.displayName ?? data.name?.formatted ?? null,
    givenName: data.name?.givenName ?? null,
    familyName: data.name?.familyName ?? null,
    isActive: data.active === undefined ? true : toBoolean(data.active),
  });
}

export function parseGroupBody(body: unknown): ScimGroupInput {
  const parsed = groupBodySchema.safeParse(body);

  if (!parsed.success) {
    throw invalid(parsed.error);
  }

  return {
    name: parsed.data.displayName,
    externalId: parsed.data.externalId ?? null,
    memberIds: [
      ...new Set((parsed.data.members ?? []).map((member) => member.value)),
    ],
  };
}

function meta(
  resourceType: 'User' | 'Group',
  id: string,
  created: Date,
  modified: Date,
  baseUrl: string,
) {
  return {
    resourceType,
    created: created.toISOString(),
    lastModified: modified.toISOString(),
    location: `${baseUrl}${SCIM_BASE_PATH}/${resourceType}s/${id}`,
  };
}

export function toUserResource(row: ScimUserRow, baseUrl: string) {
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: row.id,
    ...(row.externalId ? { externalId: row.externalId } : {}),
    userName: row.email,
    ...(row.name ? { displayName: row.name } : {}),
    name: {
      ...(row.name ? { formatted: row.name } : {}),
      ...(row.givenName ? { givenName: row.givenName } : {}),
      ...(row.familyName ? { familyName: row.familyName } : {}),
    },
    emails: [{ value: row.email, type: 'work', primary: true }],
    active: row.isActive,
    meta: meta('User', row.id, row.createdAt, row.updatedAt, baseUrl),
  };
}

export function toGroupResource(row: ScimGroupRow, baseUrl: string) {
  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: row.id,
    ...(row.externalId ? { externalId: row.externalId } : {}),
    displayName: row.name,
    members: row.members.map((member) => ({
      value: member.id,
      display: member.email,
      type: 'User',
      $ref: `${baseUrl}${SCIM_BASE_PATH}/Users/${member.id}`,
    })),
    meta: meta('Group', row.id, row.createdAt, row.updatedAt, baseUrl),
  };
}

export function listResponse(
  resources: unknown[],
  total: number,
  startIndex: number,
) {
  return {
    schemas: [SCIM_LIST_SCHEMA],
    totalResults: total,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}
