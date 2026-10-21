export const SCIM_BASE_PATH = '/scim/v2';

export const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const SCIM_GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group';
export const SCIM_LIST_SCHEMA =
  'urn:ietf:params:scim:api:messages:2.0:ListResponse';
export const SCIM_PATCH_SCHEMA =
  'urn:ietf:params:scim:api:messages:2.0:PatchOp';
export const SCIM_ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';
export const SCIM_CONFIG_SCHEMA =
  'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig';
export const SCIM_RESOURCE_TYPE_SCHEMA =
  'urn:ietf:params:scim:schemas:core:2.0:ResourceType';
export const SCIM_SCHEMA_SCHEMA =
  'urn:ietf:params:scim:schemas:core:2.0:Schema';

export const SCIM_CONTENT_TYPE = 'application/scim+json';
export const SCIM_MAX_COUNT = 100;
export const SCIM_DEACTIVATION_REASON = 'scim-deactivated';

export const SCIM_TOKEN_STORE = Symbol('SCIM_TOKEN_STORE');
export const SCIM_DIRECTORY_STORE = Symbol('SCIM_DIRECTORY_STORE');

export type ScimResourceKind = 'user' | 'group';

export interface ScimCaller {
  tenantId: string;
  tokenId: string;
}

export interface ScimUserRow {
  id: string;
  email: string;
  name: string | null;
  givenName: string | null;
  familyName: string | null;
  externalId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScimGroupMember {
  id: string;
  email: string;
}

export interface ScimGroupRow {
  id: string;
  name: string;
  externalId: string | null;
  members: ScimGroupMember[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ScimListQuery {
  filter: { attribute: string; value: string } | null;
  startIndex: number;
  count: number;
}

export interface ScimPage<T> {
  rows: T[];
  total: number;
}

export interface ScimUserInput {
  email: string;
  name: string | null;
  givenName: string | null;
  familyName: string | null;
  externalId: string | null;
  isActive: boolean;
}

export interface ScimGroupInput {
  name: string;
  externalId: string | null;
  memberIds: string[];
}
