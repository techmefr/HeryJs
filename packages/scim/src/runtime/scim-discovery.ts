import {
  SCIM_BASE_PATH,
  SCIM_CONFIG_SCHEMA,
  SCIM_GROUP_SCHEMA,
  SCIM_LIST_SCHEMA,
  SCIM_MAX_COUNT,
  SCIM_RESOURCE_TYPE_SCHEMA,
  SCIM_SCHEMA_SCHEMA,
  SCIM_USER_SCHEMA,
} from './scim.types';

export function serviceProviderConfig(baseUrl: string) {
  return {
    schemas: [SCIM_CONFIG_SCHEMA],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: SCIM_MAX_COUNT },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: 'oauthbearertoken',
        name: 'Bearer token',
        description: 'A per-tenant token issued from the admin.',
        primary: true,
      },
    ],
    meta: {
      resourceType: 'ServiceProviderConfig',
      location: `${baseUrl}${SCIM_BASE_PATH}/ServiceProviderConfig`,
    },
  };
}

export function resourceTypes(baseUrl: string) {
  const types = [
    { id: 'User', name: 'User', endpoint: '/Users', schema: SCIM_USER_SCHEMA },
    {
      id: 'Group',
      name: 'Group',
      endpoint: '/Groups',
      schema: SCIM_GROUP_SCHEMA,
    },
  ];

  return list(
    types.map((type) => ({
      schemas: [SCIM_RESOURCE_TYPE_SCHEMA],
      ...type,
      meta: {
        resourceType: 'ResourceType',
        location: `${baseUrl}${SCIM_BASE_PATH}/ResourceTypes/${type.id}`,
      },
    })),
  );
}

function attribute(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    type: 'string',
    multiValued: false,
    required: false,
    mutability: 'readWrite',
    returned: 'default',
    uniqueness: 'none',
    ...extra,
  };
}

export function schemas(baseUrl: string) {
  const definitions = [
    {
      id: SCIM_USER_SCHEMA,
      name: 'User',
      attributes: [
        attribute('userName', { required: true, uniqueness: 'server' }),
        attribute('externalId'),
        attribute('displayName'),
        attribute('name', {
          type: 'complex',
          subAttributes: [attribute('givenName'), attribute('familyName')],
        }),
        attribute('emails', { type: 'complex', multiValued: true }),
        attribute('active', { type: 'boolean' }),
      ],
    },
    {
      id: SCIM_GROUP_SCHEMA,
      name: 'Group',
      attributes: [
        attribute('displayName', { required: true }),
        attribute('externalId'),
        attribute('members', { type: 'complex', multiValued: true }),
      ],
    },
  ];

  return list(
    definitions.map((definition) => ({
      schemas: [SCIM_SCHEMA_SCHEMA],
      ...definition,
      meta: {
        resourceType: 'Schema',
        location: `${baseUrl}${SCIM_BASE_PATH}/Schemas/${definition.id}`,
      },
    })),
  );
}

function list(resources: unknown[]) {
  return {
    schemas: [SCIM_LIST_SCHEMA],
    totalResults: resources.length,
    startIndex: 1,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}
