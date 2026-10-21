import { Inject, Injectable } from '@nestjs/common';
import { ScimException } from './scim.exception';
import { SCIM_DIRECTORY_STORE } from './scim.types';
import type { ScimListQuery, ScimPage, ScimUserRow } from './scim.types';
import type { ScimDirectoryStore } from './scim-directory.store';
import { applyUserPatch, parsePatchRequest } from './scim-patch';
import type { ScimUserState } from './scim-patch';
import { parseUserBody, userInputFrom } from './scim-resources';

export type ScimUserAction =
  | 'created'
  | 'updated'
  | 'deactivated'
  | 'reactivated';

export interface ScimUserOutcome {
  row: ScimUserRow;
  action: ScimUserAction;
}

function stateOf(row: ScimUserRow): ScimUserState {
  return {
    userName: row.email,
    externalId: row.externalId,
    displayName: row.name,
    givenName: row.givenName,
    familyName: row.familyName,
    isActive: row.isActive,
  };
}

function actionOf(before: ScimUserRow, after: ScimUserRow): ScimUserAction {
  if (before.isActive && !after.isActive) {
    return 'deactivated';
  }

  return !before.isActive && after.isActive ? 'reactivated' : 'updated';
}

/**
 * Users are the tenant's members: a SCIM id is the member's own id, so a member
 * who signed in before the directory was connected is found by `userName` and
 * managed like any other. Deactivating bans the account and ends its sessions;
 * nothing is ever deleted, so a person who comes back keeps their history.
 */
@Injectable()
export class ScimUsersService {
  constructor(
    @Inject(SCIM_DIRECTORY_STORE) private readonly store: ScimDirectoryStore,
  ) {}

  list(tenantId: string, query: ScimListQuery): Promise<ScimPage<ScimUserRow>> {
    return this.store.listUsers(tenantId, query);
  }

  async get(tenantId: string, id: string): Promise<ScimUserRow> {
    return this.require(tenantId, id);
  }

  async create(tenantId: string, body: unknown): Promise<ScimUserOutcome> {
    const row = await this.store.createUser(tenantId, parseUserBody(body));

    return { row, action: 'created' };
  }

  async replace(
    tenantId: string,
    id: string,
    body: unknown,
  ): Promise<ScimUserOutcome> {
    const before = await this.require(tenantId, id);

    return this.write(tenantId, before, parseUserBody(body));
  }

  async patch(
    tenantId: string,
    id: string,
    body: unknown,
  ): Promise<ScimUserOutcome> {
    const before = await this.require(tenantId, id);
    const state = applyUserPatch(stateOf(before), parsePatchRequest(body));

    return this.write(tenantId, before, userInputFrom(state));
  }

  async deactivate(tenantId: string, id: string): Promise<ScimUserOutcome> {
    const before = await this.require(tenantId, id);
    const state = { ...stateOf(before), isActive: false };

    return this.write(tenantId, before, userInputFrom(state));
  }

  private async write(
    tenantId: string,
    before: ScimUserRow,
    input: ReturnType<typeof userInputFrom>,
  ): Promise<ScimUserOutcome> {
    const row = await this.store.updateUser(tenantId, before.id, input);

    if (!row) {
      throw ScimException.notFound('user');
    }

    return { row, action: actionOf(before, row) };
  }

  private async require(tenantId: string, id: string): Promise<ScimUserRow> {
    const row = await this.store.findUser(tenantId, id);

    if (!row) {
      throw ScimException.notFound('user');
    }

    return row;
  }
}
