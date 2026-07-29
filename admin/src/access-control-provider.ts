import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import type { AccessControlProvider } from '@refinedev/core';

// Placeholder rules until the backend exposes real capabilities for
// technical resources (feature flags, audit) the way it already does
// for functional ones via `?include=capabilities`.
function buildAbility() {
  const { can, build } = new AbilityBuilder(createMongoAbility);
  can('manage', 'feature-flags');
  return build();
}

const ability = buildAbility();

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    const allowed = ability.can(action, resource ?? 'all');
    return { can: allowed };
  },
};
