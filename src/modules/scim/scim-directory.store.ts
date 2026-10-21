import type {
  ScimGroupInput,
  ScimGroupRow,
  ScimListQuery,
  ScimPage,
  ScimUserInput,
  ScimUserRow,
} from './scim.types';

/**
 * What the SCIM services need of the tenant's directory, which is its members
 * (users) and its teams (groups). Every method names the tenant, because a
 * SCIM caller is authenticated by a token, not by a session that carries one.
 *
 * Writes that would break uniqueness -- an address another account already
 * holds, an externalId another resource already carries -- throw a SCIM
 * `uniqueness` conflict; a resource that is not in the tenant is `null`.
 */
export interface ScimDirectoryStore {
  listUsers(
    tenantId: string,
    query: ScimListQuery,
  ): Promise<ScimPage<ScimUserRow>>;
  findUser(tenantId: string, id: string): Promise<ScimUserRow | null>;
  createUser(tenantId: string, input: ScimUserInput): Promise<ScimUserRow>;
  updateUser(
    tenantId: string,
    id: string,
    input: ScimUserInput,
  ): Promise<ScimUserRow | null>;
  existingUserIds(tenantId: string, ids: string[]): Promise<string[]>;
  listGroups(
    tenantId: string,
    query: ScimListQuery,
  ): Promise<ScimPage<ScimGroupRow>>;
  findGroup(tenantId: string, id: string): Promise<ScimGroupRow | null>;
  createGroup(tenantId: string, input: ScimGroupInput): Promise<ScimGroupRow>;
  updateGroup(
    tenantId: string,
    id: string,
    input: ScimGroupInput,
  ): Promise<ScimGroupRow | null>;
  deleteGroup(tenantId: string, id: string): Promise<boolean>;
}
