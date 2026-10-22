import { Injectable } from '@nestjs/common';
import type { CapabilityRecord } from '#technical/capabilities/capabilities.types';
import type {
  ChangeFeedResource,
  ChangeFeedResourceDefinition,
} from './change-feed.types';

@Injectable()
export class ChangeFeedRegistry {
  private readonly byModelName = new Map<string, ChangeFeedResource>();
  private readonly byChannelName = new Map<string, ChangeFeedResource>();

  register<TRecord extends CapabilityRecord>(
    definition: ChangeFeedResourceDefinition<TRecord>,
  ): void {
    if (this.byModelName.has(definition.model)) {
      throw new Error(
        `The model "${definition.model}" is already registered on the change feed.`,
      );
    }

    if (this.byChannelName.has(definition.channel)) {
      throw new Error(
        `The channel "${definition.channel}" is already registered on the change feed.`,
      );
    }

    const resource: ChangeFeedResource = {
      model: definition.model,
      channel: definition.channel,
      canViewAny: definition.canViewAny,
      canView: definition.canView,
      canBroadcast: definition.canBroadcast ?? null,
      project: async (id) => {
        const record = await definition.load(id);

        if (!record) {
          return null;
        }

        return {
          view: definition.toView(record),
          visibility: {
            ownerId: record.ownerId,
            teamId: record.teamId,
            ...(record.shares ? { shares: record.shares } : {}),
          },
        };
      },
    };

    this.byModelName.set(resource.model, resource);
    this.byChannelName.set(resource.channel, resource);
  }

  forModel(model: string): ChangeFeedResource | null {
    return this.byModelName.get(model) ?? null;
  }

  forChannel(channel: string): ChangeFeedResource | null {
    return this.byChannelName.get(channel) ?? null;
  }

  channels(): string[] {
    return [...this.byChannelName.keys()];
  }
}
