import { Inject, Injectable } from '@nestjs/common';
import { ScimException } from './scim.exception';
import { SCIM_DIRECTORY_STORE } from './scim.types';
import type {
  ScimGroupInput,
  ScimGroupRow,
  ScimListQuery,
  ScimPage,
} from './scim.types';
import type { ScimDirectoryStore } from './scim-directory.store';
import { applyGroupPatch, parsePatchRequest } from './scim-patch';
import { parseGroupBody } from './scim-resources';

export type ScimGroupAction = 'created' | 'updated' | 'deleted';

export interface ScimGroupOutcome {
  row: ScimGroupRow;
  action: ScimGroupAction;
}

/**
 * Groups are the tenant's teams, and membership is team membership, so a
 * group the directory pushes is a perimeter the application's team-scoped
 * capabilities already understand. Only the tenant's own users can be members.
 */
@Injectable()
export class ScimGroupsService {
  constructor(
    @Inject(SCIM_DIRECTORY_STORE) private readonly store: ScimDirectoryStore,
  ) {}

  list(
    tenantId: string,
    query: ScimListQuery,
  ): Promise<ScimPage<ScimGroupRow>> {
    return this.store.listGroups(tenantId, query);
  }

  get(tenantId: string, id: string): Promise<ScimGroupRow> {
    return this.require(tenantId, id);
  }

  async create(tenantId: string, body: unknown): Promise<ScimGroupOutcome> {
    const input = parseGroupBody(body);

    await this.assertMembers(tenantId, input.memberIds);

    return {
      row: await this.store.createGroup(tenantId, input),
      action: 'created',
    };
  }

  async replace(
    tenantId: string,
    id: string,
    body: unknown,
  ): Promise<ScimGroupOutcome> {
    await this.require(tenantId, id);

    return this.write(tenantId, id, parseGroupBody(body));
  }

  async patch(
    tenantId: string,
    id: string,
    body: unknown,
  ): Promise<ScimGroupOutcome> {
    const before = await this.require(tenantId, id);
    const state = applyGroupPatch(
      {
        displayName: before.name,
        externalId: before.externalId,
        memberIds: before.members.map((member) => member.id),
      },
      parsePatchRequest(body),
    );

    return this.write(tenantId, id, {
      name: state.displayName,
      externalId: state.externalId,
      memberIds: state.memberIds,
    });
  }

  async remove(tenantId: string, id: string): Promise<ScimGroupOutcome> {
    const row = await this.require(tenantId, id);

    await this.store.deleteGroup(tenantId, id);

    return { row, action: 'deleted' };
  }

  private async write(
    tenantId: string,
    id: string,
    input: ScimGroupInput,
  ): Promise<ScimGroupOutcome> {
    await this.assertMembers(tenantId, input.memberIds);

    const row = await this.store.updateGroup(tenantId, id, input);

    if (!row) {
      throw ScimException.notFound('group');
    }

    return { row, action: 'updated' };
  }

  private async assertMembers(
    tenantId: string,
    memberIds: string[],
  ): Promise<void> {
    if (memberIds.length === 0) {
      return;
    }

    const known = new Set(await this.store.existingUserIds(tenantId, memberIds));
    const unknown = memberIds.filter((id) => !known.has(id));

    if (unknown.length > 0) {
      throw ScimException.badRequest(
        `Not users of this tenant: ${unknown.slice(0, 5).join(', ')}.`,
        'invalidValue',
      );
    }
  }

  private async require(tenantId: string, id: string): Promise<ScimGroupRow> {
    const row = await this.store.findGroup(tenantId, id);

    if (!row) {
      throw ScimException.notFound('group');
    }

    return row;
  }
}
