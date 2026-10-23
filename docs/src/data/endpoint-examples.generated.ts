import type { PlaygroundScenario } from './scenario-types';

export const searchScenarios: PlaygroundScenario[] = [
  {
    id: 'filter',
    label: 'Filter on the title',
    method: 'POST',
    path: '/blog-posts/search',
    request:
      'POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  "filters": [\n    {\n      "field": "title",\n      "operator": "like",\n      "value": "hello"\n    }\n  ]\n}',
    response:
      '{\n  "data": [],\n  "meta": {\n    "channels": [\n      "blogPost"\n    ],\n    "page": 1,\n    "limit": 15,\n    "last_page": 1,\n    "next_cursor": null,\n    "total": 0\n  },\n  "messages": []\n}',
    flow: [
      {
        stage: 'middleware',
        label: 'tenant resolution',
        status: 'ok',
        detail: {
          tenantId: 'default',
        },
      },
      {
        stage: 'guard',
        label: 'session',
        status: 'ok',
        detail: {
          userId: 'cxmpl00000000000000000001',
        },
      },
      {
        stage: 'guard',
        label: 'capability',
        status: 'ok',
        detail: {
          policy: 'canViewAnyBlogPost',
          scope: 'own',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT COUNT(*) AS "_count$_all" FROM (SELECT "public"."BlogPost"."id" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."ownerId" = $1 AND "public"."BlogPost"."deletedAt" IS NULL AND "public"."BlogPost"."title"::text LIKE (\'%\' || $2 || \'%\') AND "public"."BlogPost"."tenantId" = $3) OFFSET $4) AS "sub"',
          params: '["cxmpl00000000000000000001","hello","default","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."ownerId" = $1 AND "public"."BlogPost"."deletedAt" IS NULL AND "public"."BlogPost"."title"::text LIKE (\'%\' || $2 || \'%\') AND "public"."BlogPost"."tenantId" = $3) ORDER BY "public"."BlogPost"."createdAt" DESC, "public"."BlogPost"."id" DESC LIMIT $4 OFFSET $5',
          params: '["cxmpl00000000000000000001","hello","default","15","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'controller',
        label: 'BlogPostController.search',
        status: 'ok',
      },
    ],
  },
  {
    id: 'sort-paginate',
    label: 'Sort and paginate',
    method: 'POST',
    path: '/blog-posts/search',
    request:
      'POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  "sorts": [\n    {\n      "field": "createdAt",\n      "direction": "desc"\n    }\n  ],\n  "page": 1,\n  "limit": 10\n}',
    response:
      '{\n  "data": [\n    {\n      "id": "cxmpl00000000000000000002",\n      "tenantId": "default",\n      "ownerId": "cxmpl00000000000000000001",\n      "title": "Changelog",\n      "slug": "changelog",\n      "summary": null,\n      "summaryTranslations": {},\n      "body": null,\n      "createdAt": "2026-01-15T09:00:02.000Z",\n      "updatedAt": "2026-01-15T09:00:02.000Z",\n      "deletedAt": null\n    },\n    {\n      "id": "cxmpl00000000000000000003",\n      "tenantId": "default",\n      "ownerId": "cxmpl00000000000000000001",\n      "title": "Release notes",\n      "slug": "release-notes",\n      "summary": null,\n      "summaryTranslations": {},\n      "body": null,\n      "createdAt": "2026-01-15T09:00:01.000Z",\n      "updatedAt": "2026-01-15T09:00:01.000Z",\n      "deletedAt": null\n    },\n    {\n      "id": "cxmpl00000000000000000004",\n      "tenantId": "default",\n      "ownerId": "cxmpl00000000000000000001",\n      "title": "Hello world",\n      "slug": "hello-world",\n      "summary": null,\n      "summaryTranslations": {},\n      "body": null,\n      "createdAt": "2026-01-15T09:00:00.000Z",\n      "updatedAt": "2026-01-15T09:00:00.000Z",\n      "deletedAt": null\n    }\n  ],\n  "meta": {\n    "channels": [\n      "blogPost"\n    ],\n    "page": 1,\n    "limit": 10,\n    "last_page": 1,\n    "next_cursor": null,\n    "total": 3\n  },\n  "messages": []\n}',
    flow: [
      {
        stage: 'middleware',
        label: 'tenant resolution',
        status: 'ok',
        detail: {
          tenantId: 'default',
        },
      },
      {
        stage: 'guard',
        label: 'session',
        status: 'ok',
        detail: {
          userId: 'cxmpl00000000000000000001',
        },
      },
      {
        stage: 'guard',
        label: 'capability',
        status: 'ok',
        detail: {
          policy: 'canViewAnyBlogPost',
          scope: 'own',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT COUNT(*) AS "_count$_all" FROM (SELECT "public"."BlogPost"."id" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."ownerId" = $1 AND "public"."BlogPost"."deletedAt" IS NULL AND "public"."BlogPost"."tenantId" = $2) OFFSET $3) AS "sub"',
          params: '["cxmpl00000000000000000001","default","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."ownerId" = $1 AND "public"."BlogPost"."deletedAt" IS NULL AND "public"."BlogPost"."tenantId" = $2) ORDER BY "public"."BlogPost"."createdAt" DESC, "public"."BlogPost"."id" DESC LIMIT $3 OFFSET $4',
          params: '["cxmpl00000000000000000001","default","10","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'controller',
        label: 'BlogPostController.search',
        status: 'ok',
      },
    ],
  },
  {
    id: 'by-id',
    label: 'Look one record up by id',
    method: 'POST',
    path: '/blog-posts/search',
    request:
      'POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  "filters": [\n    {\n      "field": "id",\n      "value": "cxmpl00000000000000000005"\n    }\n  ]\n}',
    response:
      '{\n  "data": [\n    {\n      "id": "cxmpl00000000000000000005",\n      "tenantId": "default",\n      "ownerId": "cxmpl00000000000000000001",\n      "title": "Fetched by id",\n      "slug": "fetched-by-id",\n      "summary": null,\n      "summaryTranslations": {},\n      "body": null,\n      "createdAt": "2026-01-15T09:00:03.000Z",\n      "updatedAt": "2026-01-15T09:00:03.000Z",\n      "deletedAt": null\n    }\n  ],\n  "meta": {\n    "channels": [\n      "blogPost"\n    ],\n    "page": 1,\n    "limit": 15,\n    "last_page": 1,\n    "next_cursor": null,\n    "total": 1\n  },\n  "messages": []\n}',
    flow: [
      {
        stage: 'middleware',
        label: 'tenant resolution',
        status: 'ok',
        detail: {
          tenantId: 'default',
        },
      },
      {
        stage: 'guard',
        label: 'session',
        status: 'ok',
        detail: {
          userId: 'cxmpl00000000000000000001',
        },
      },
      {
        stage: 'guard',
        label: 'capability',
        status: 'ok',
        detail: {
          policy: 'canViewAnyBlogPost',
          scope: 'own',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT COUNT(*) AS "_count$_all" FROM (SELECT "public"."BlogPost"."id" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."ownerId" = $1 AND "public"."BlogPost"."deletedAt" IS NULL AND "public"."BlogPost"."id" = $2 AND "public"."BlogPost"."tenantId" = $3) OFFSET $4) AS "sub"',
          params:
            '["cxmpl00000000000000000001","cxmpl00000000000000000005","default","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."ownerId" = $1 AND "public"."BlogPost"."deletedAt" IS NULL AND "public"."BlogPost"."id" = $2 AND "public"."BlogPost"."tenantId" = $3) ORDER BY "public"."BlogPost"."createdAt" DESC, "public"."BlogPost"."id" DESC LIMIT $4 OFFSET $5',
          params:
            '["cxmpl00000000000000000001","cxmpl00000000000000000005","default","15","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'controller',
        label: 'BlogPostController.search',
        status: 'ok',
      },
    ],
  },
];

export const createScenarios: PlaygroundScenario[] = [
  {
    id: 'create',
    label: 'Create a post',
    method: 'POST',
    path: '/blog-posts/create',
    request:
      'POST /blog-posts/create\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  "data": [\n    {\n      "title": "Hello world"\n    }\n  ]\n}',
    response:
      '{\n  "data": [\n    {\n      "index": 0,\n      "status": "ok",\n      "data": {\n        "id": "cxmpl00000000000000000006",\n        "tenantId": "default",\n        "ownerId": "cxmpl00000000000000000001",\n        "title": "Hello world",\n        "slug": "hello-world-2",\n        "summary": null,\n        "summaryTranslations": {},\n        "body": null,\n        "createdAt": "2026-01-15T09:00:04.000Z",\n        "updatedAt": "2026-01-15T09:00:04.000Z",\n        "deletedAt": null\n      }\n    }\n  ],\n  "meta": {\n    "total": 1,\n    "succeeded": 1,\n    "failed": 0\n  },\n  "messages": []\n}',
    flow: [
      {
        stage: 'middleware',
        label: 'tenant resolution',
        status: 'ok',
        detail: {
          tenantId: 'default',
        },
      },
      {
        stage: 'guard',
        label: 'session',
        status: 'ok',
        detail: {
          userId: 'cxmpl00000000000000000001',
        },
      },
      {
        stage: 'guard',
        label: 'capability',
        status: 'ok',
        detail: {
          policy: 'canCreateBlogPost',
          scope: 'own',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'INSERT INTO "public"."AuditLog" ("id","tenantId","model","operation","recordId","data","userId","impersonatedBy","hash","previousHash","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING "public"."AuditLog"."id", "public"."AuditLog"."sequence", "public"."AuditLog"."tenantId", "public"."AuditLog"."model", "public"."AuditLog"."operation", "public"."AuditLog"."recordId", "public"."AuditLog"."data", "public"."AuditLog"."userId", "public"."AuditLog"."impersonatedBy", "public"."AuditLog"."hash", "public"."AuditLog"."previousHash", "public"."AuditLog"."createdAt", "public"."AuditLog"."redactedAt"',
          params:
            '["cxmpl00000000000000000007","default","BlogPost","create","cxmpl00000000000000000006","{\\"id\\":\\"cxmpl00000000000000000006\\",\\"tenantId\\":\\"default\\",\\"ownerId\\":\\"cxmpl00000000000000000001\\",\\"title\\":\\"Hello world\\",\\"slug\\":\\"hello-world-2\\",\\"summary\\":null,\\"body\\":null,\\"privateNote\\":null,\\"createdAt\\":\\"2026-01-15T09:00:04.000Z\\",\\"updatedAt\\":\\"2026-01-15T09:00:04.000Z\\",\\"deletedAt\\":null}","cxmpl00000000000000000001",null,"0000000000000000000000000000000000000000000000000000000000000001","0000000000000000000000000000000000000000000000000000000000000002","2026-01-15T09:00:04.000Z"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'INSERT INTO "public"."BlogPost" ("id","tenantId","ownerId","title","slug","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt"',
          params:
            '["cxmpl00000000000000000006","default","cxmpl00000000000000000001","Hello world","hello-world-2","2026-01-15T09:00:04.000Z","2026-01-15T09:00:04.000Z"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'INSERT INTO "public"."OutboxMessage" ("id","tenantId","name","payload","status","attempts","nextAttemptAt","createdAt","locale") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          params:
            '["cxmpl00000000000000000008","default","model.created","{\\"model\\":\\"BlogPost\\",\\"kind\\":\\"created\\",\\"recordId\\":\\"cxmpl00000000000000000006\\",\\"tenantId\\":\\"default\\",\\"changedFields\\":[],\\"ownerId\\":\\"cxmpl00000000000000000001\\",\\"teamId\\":null,\\"userId\\":\\"cxmpl00000000000000000001\\",\\"impersonatedBy\\":null}","pending","0","2026-01-15T09:00:04.000Z","2026-01-15T09:00:04.000Z","en"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."AuditLog"."id", "public"."AuditLog"."sequence", "public"."AuditLog"."tenantId", "public"."AuditLog"."model", "public"."AuditLog"."operation", "public"."AuditLog"."recordId", "public"."AuditLog"."data", "public"."AuditLog"."userId", "public"."AuditLog"."impersonatedBy", "public"."AuditLog"."hash", "public"."AuditLog"."previousHash", "public"."AuditLog"."createdAt", "public"."AuditLog"."redactedAt" FROM "public"."AuditLog" WHERE "public"."AuditLog"."tenantId" = $1 ORDER BY "public"."AuditLog"."sequence" DESC LIMIT $2 OFFSET $3',
          params: '["default","1","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."BlogPost"."id", "public"."BlogPost"."slug" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."slug"::text LIKE ($1 || \'%\') AND "public"."BlogPost"."tenantId" = $2) ORDER BY "public"."BlogPost"."id" ASC LIMIT $3 OFFSET $4',
          params: '["hello-world","default","1000","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT pg_advisory_xact_lock(hashtext($1))',
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'controller',
        label: 'BlogPostController.create',
        status: 'ok',
      },
    ],
  },
  {
    id: 'validation-failed',
    label: 'Invalid payload',
    method: 'POST',
    path: '/blog-posts/create',
    request:
      'POST /blog-posts/create\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  "data": [\n    {}\n  ]\n}',
    response:
      '{\n  "error": {\n    "status": 400,\n    "key": "validation.failed",\n    "message": "The request is invalid. Each issue is listed in details.issues.",\n    "details": {\n      "formErrors": [],\n      "fieldErrors": {\n        "data": [\n          "Invalid input: expected string, received undefined"\n        ]\n      },\n      "issues": [\n        {\n          "path": [\n            "data",\n            0,\n            "title"\n          ],\n          "code": "invalid_type",\n          "message": "Invalid input: expected string, received undefined"\n        }\n      ]\n    }\n  }\n}',
    flow: [
      {
        stage: 'middleware',
        label: 'tenant resolution',
        status: 'ok',
        detail: {
          tenantId: 'default',
        },
      },
      {
        stage: 'guard',
        label: 'session',
        status: 'ok',
        detail: {
          userId: 'cxmpl00000000000000000001',
        },
      },
      {
        stage: 'guard',
        label: 'capability',
        status: 'ok',
        detail: {
          policy: 'canCreateBlogPost',
          scope: 'own',
        },
      },
      {
        stage: 'controller',
        label: 'BlogPostController.create',
        status: 'error',
        detail: {
          message:
            'The request is invalid. Each issue is listed in details.issues.',
        },
      },
    ],
  },
];

export const updateScenarios: PlaygroundScenario[] = [
  {
    id: 'update',
    label: 'Update one field',
    method: 'POST',
    path: '/blog-posts/update',
    request:
      'POST /blog-posts/update\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  "data": [\n    {\n      "id": "cxmpl00000000000000000009",\n      "title": "Hello world (v2)"\n    }\n  ]\n}',
    response:
      '{\n  "data": [\n    {\n      "index": 0,\n      "id": "cxmpl00000000000000000009",\n      "status": "ok",\n      "data": {\n        "id": "cxmpl00000000000000000009",\n        "tenantId": "default",\n        "ownerId": "cxmpl00000000000000000001",\n        "title": "Hello world (v2)",\n        "slug": "hello-world-v2",\n        "summary": null,\n        "summaryTranslations": {},\n        "body": null,\n        "createdAt": "2026-01-15T09:00:05.000Z",\n        "updatedAt": "2026-01-15T09:00:05.000Z",\n        "deletedAt": null\n      }\n    }\n  ],\n  "meta": {\n    "total": 1,\n    "succeeded": 1,\n    "failed": 0\n  },\n  "messages": []\n}',
    flow: [
      {
        stage: 'middleware',
        label: 'tenant resolution',
        status: 'ok',
        detail: {
          tenantId: 'default',
        },
      },
      {
        stage: 'guard',
        label: 'session',
        status: 'ok',
        detail: {
          userId: 'cxmpl00000000000000000001',
        },
      },
      {
        stage: 'guard',
        label: 'capability',
        status: 'ok',
        detail: {
          policy: 'canUpdateAnyBlogPost',
          scope: 'own',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'INSERT INTO "public"."AuditLog" ("id","tenantId","model","operation","recordId","data","userId","impersonatedBy","hash","previousHash","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING "public"."AuditLog"."id", "public"."AuditLog"."sequence", "public"."AuditLog"."tenantId", "public"."AuditLog"."model", "public"."AuditLog"."operation", "public"."AuditLog"."recordId", "public"."AuditLog"."data", "public"."AuditLog"."userId", "public"."AuditLog"."impersonatedBy", "public"."AuditLog"."hash", "public"."AuditLog"."previousHash", "public"."AuditLog"."createdAt", "public"."AuditLog"."redactedAt"',
          params:
            '["cxmpl00000000000000000010","default","BlogPost","update","cxmpl00000000000000000009","{\\"id\\":\\"cxmpl00000000000000000009\\",\\"tenantId\\":\\"default\\",\\"ownerId\\":\\"cxmpl00000000000000000001\\",\\"title\\":\\"Hello world (v2)\\",\\"slug\\":\\"hello-world-v2\\",\\"summary\\":null,\\"body\\":null,\\"privateNote\\":null,\\"createdAt\\":\\"2026-01-15T09:00:05.000Z\\",\\"updatedAt\\":\\"2026-01-15T09:00:05.000Z\\",\\"deletedAt\\":null}","cxmpl00000000000000000001",null,"0000000000000000000000000000000000000000000000000000000000000003","0000000000000000000000000000000000000000000000000000000000000004","2026-01-15T09:00:05.000Z"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'INSERT INTO "public"."OutboxMessage" ("id","tenantId","name","payload","status","attempts","nextAttemptAt","createdAt","locale") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          params:
            '["cxmpl00000000000000000011","default","model.updated","{\\"model\\":\\"BlogPost\\",\\"kind\\":\\"updated\\",\\"recordId\\":\\"cxmpl00000000000000000009\\",\\"tenantId\\":\\"default\\",\\"changedFields\\":[\\"title\\",\\"slug\\"],\\"ownerId\\":\\"cxmpl00000000000000000001\\",\\"teamId\\":null,\\"userId\\":\\"cxmpl00000000000000000001\\",\\"impersonatedBy\\":null}","pending","0","2026-01-15T09:00:05.000Z","2026-01-15T09:00:05.000Z","en"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."AuditLog"."id", "public"."AuditLog"."sequence", "public"."AuditLog"."tenantId", "public"."AuditLog"."model", "public"."AuditLog"."operation", "public"."AuditLog"."recordId", "public"."AuditLog"."data", "public"."AuditLog"."userId", "public"."AuditLog"."impersonatedBy", "public"."AuditLog"."hash", "public"."AuditLog"."previousHash", "public"."AuditLog"."createdAt", "public"."AuditLog"."redactedAt" FROM "public"."AuditLog" WHERE "public"."AuditLog"."tenantId" = $1 ORDER BY "public"."AuditLog"."sequence" DESC LIMIT $2 OFFSET $3',
          params: '["default","1","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."BlogPost"."id", "public"."BlogPost"."slug" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."slug"::text LIKE ($1 || \'%\') AND "public"."BlogPost"."tenantId" = $2) ORDER BY "public"."BlogPost"."id" ASC LIMIT $3 OFFSET $4',
          params: '["hello-world-v2","default","1000","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."id" = $1 AND "public"."BlogPost"."tenantId" = $2) LIMIT $3 OFFSET $4',
          params: '["cxmpl00000000000000000009","default","1","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT pg_advisory_xact_lock(hashtext($1))',
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'UPDATE "public"."BlogPost" SET "title" = $1, "slug" = $2, "updatedAt" = $3 WHERE ("public"."BlogPost"."id" = $4 AND "public"."BlogPost"."tenantId" = $5) RETURNING "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt"',
          params:
            '["Hello world (v2)","hello-world-v2","2026-01-15T09:00:05.000Z","cxmpl00000000000000000009","default"]',
        },
      },
      {
        stage: 'controller',
        label: 'BlogPostController.update',
        status: 'ok',
      },
    ],
  },
  {
    id: 'attach-tags',
    label: 'Attach a tag',
    method: 'POST',
    path: '/blog-posts/update',
    request:
      'POST /blog-posts/update\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  "data": [\n    {\n      "id": "cxmpl00000000000000000012",\n      "relations": {\n        "tags": {\n          "attach": [\n            "cxmpl00000000000000000013"\n          ]\n        }\n      }\n    }\n  ]\n}',
    response:
      '{\n  "data": [\n    {\n      "index": 0,\n      "id": "cxmpl00000000000000000012",\n      "status": "ok",\n      "data": {\n        "id": "cxmpl00000000000000000012",\n        "tenantId": "default",\n        "ownerId": "cxmpl00000000000000000001",\n        "title": "Tagged article",\n        "slug": "tagged-article",\n        "summary": null,\n        "summaryTranslations": {},\n        "body": null,\n        "createdAt": "2026-01-15T09:00:06.000Z",\n        "updatedAt": "2026-01-15T09:00:06.000Z",\n        "deletedAt": null,\n        "tags": [\n          "cxmpl00000000000000000013"\n        ]\n      }\n    }\n  ],\n  "meta": {\n    "total": 1,\n    "succeeded": 1,\n    "failed": 0\n  },\n  "messages": []\n}',
    flow: [
      {
        stage: 'middleware',
        label: 'tenant resolution',
        status: 'ok',
        detail: {
          tenantId: 'default',
        },
      },
      {
        stage: 'guard',
        label: 'session',
        status: 'ok',
        detail: {
          userId: 'cxmpl00000000000000000001',
        },
      },
      {
        stage: 'guard',
        label: 'capability',
        status: 'ok',
        detail: {
          policy: 'canUpdateAnyBlogPost',
          scope: 'own',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'INSERT INTO "public"."AuditLog" ("id","tenantId","model","operation","recordId","data","userId","impersonatedBy","hash","previousHash","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING "public"."AuditLog"."id", "public"."AuditLog"."sequence", "public"."AuditLog"."tenantId", "public"."AuditLog"."model", "public"."AuditLog"."operation", "public"."AuditLog"."recordId", "public"."AuditLog"."data", "public"."AuditLog"."userId", "public"."AuditLog"."impersonatedBy", "public"."AuditLog"."hash", "public"."AuditLog"."previousHash", "public"."AuditLog"."createdAt", "public"."AuditLog"."redactedAt"',
          params:
            '["cxmpl00000000000000000014","default","BlogPost","update","cxmpl00000000000000000012","{\\"id\\":\\"cxmpl00000000000000000012\\",\\"tenantId\\":\\"default\\",\\"ownerId\\":\\"cxmpl00000000000000000001\\",\\"title\\":\\"Tagged article\\",\\"slug\\":\\"tagged-article\\",\\"summary\\":null,\\"body\\":null,\\"privateNote\\":null,\\"createdAt\\":\\"2026-01-15T09:00:06.000Z\\",\\"updatedAt\\":\\"2026-01-15T09:00:06.000Z\\",\\"deletedAt\\":null}","cxmpl00000000000000000001",null,"0000000000000000000000000000000000000000000000000000000000000005","0000000000000000000000000000000000000000000000000000000000000006","2026-01-15T09:00:06.000Z"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'INSERT INTO "public"."BlogPostTag" ("tenantId","blogPostId","tagId","createdAt") VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          params:
            '["default","cxmpl00000000000000000012","cxmpl00000000000000000013","2026-01-15T09:00:06.000Z"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'INSERT INTO "public"."OutboxMessage" ("id","tenantId","name","payload","status","attempts","nextAttemptAt","createdAt","locale") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          params:
            '["cxmpl00000000000000000015","default","model.updated","{\\"model\\":\\"BlogPost\\",\\"kind\\":\\"updated\\",\\"recordId\\":\\"cxmpl00000000000000000012\\",\\"tenantId\\":\\"default\\",\\"changedFields\\":[],\\"ownerId\\":\\"cxmpl00000000000000000001\\",\\"teamId\\":null,\\"userId\\":\\"cxmpl00000000000000000001\\",\\"impersonatedBy\\":null}","pending","0","2026-01-15T09:00:06.000Z","2026-01-15T09:00:06.000Z","en"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."AuditLog"."id", "public"."AuditLog"."sequence", "public"."AuditLog"."tenantId", "public"."AuditLog"."model", "public"."AuditLog"."operation", "public"."AuditLog"."recordId", "public"."AuditLog"."data", "public"."AuditLog"."userId", "public"."AuditLog"."impersonatedBy", "public"."AuditLog"."hash", "public"."AuditLog"."previousHash", "public"."AuditLog"."createdAt", "public"."AuditLog"."redactedAt" FROM "public"."AuditLog" WHERE "public"."AuditLog"."tenantId" = $1 ORDER BY "public"."AuditLog"."sequence" DESC LIMIT $2 OFFSET $3',
          params: '["default","1","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."BlogPostTag"."blogPostId", "public"."BlogPostTag"."tagId" FROM "public"."BlogPostTag" WHERE ("public"."BlogPostTag"."blogPostId" = $1 AND "public"."BlogPostTag"."tenantId" = $2) OFFSET $3',
          params: '["cxmpl00000000000000000012","default","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."id" = $1 AND "public"."BlogPost"."tenantId" = $2) LIMIT $3 OFFSET $4',
          params: '["cxmpl00000000000000000012","default","1","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."id" = $1 AND "public"."BlogPost"."tenantId" = $2) LIMIT $3 OFFSET $4',
          params: '["cxmpl00000000000000000012","default","1","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."Tag"."id" FROM "public"."Tag" WHERE ("public"."Tag"."id" IN ($1) AND "public"."Tag"."tenantId" = $2) OFFSET $3',
          params: '["cxmpl00000000000000000013","default","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT pg_advisory_xact_lock(hashtext($1))',
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'controller',
        label: 'BlogPostController.update',
        status: 'ok',
      },
    ],
  },
];

export const deleteScenarios: PlaygroundScenario[] = [
  {
    id: 'soft',
    label: 'Soft delete',
    method: 'POST',
    path: '/blog-posts/delete',
    request:
      'POST /blog-posts/delete\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  "ids": [\n    "cxmpl00000000000000000016"\n  ]\n}',
    response:
      '{\n  "data": [\n    {\n      "index": 0,\n      "id": "cxmpl00000000000000000016",\n      "status": "ok",\n      "data": {\n        "id": "cxmpl00000000000000000016",\n        "tenantId": "default",\n        "ownerId": "cxmpl00000000000000000001",\n        "title": "Hello world",\n        "slug": "hello-world-3",\n        "summary": null,\n        "summaryTranslations": {},\n        "body": null,\n        "createdAt": "2026-01-15T09:00:07.000Z",\n        "updatedAt": "2026-01-15T09:00:07.000Z",\n        "deletedAt": "2026-01-15T09:00:07.000Z"\n      }\n    }\n  ],\n  "meta": {\n    "total": 1,\n    "succeeded": 1,\n    "failed": 0\n  },\n  "messages": []\n}',
    flow: [
      {
        stage: 'middleware',
        label: 'tenant resolution',
        status: 'ok',
        detail: {
          tenantId: 'default',
        },
      },
      {
        stage: 'guard',
        label: 'session',
        status: 'ok',
        detail: {
          userId: 'cxmpl00000000000000000001',
        },
      },
      {
        stage: 'guard',
        label: 'capability',
        status: 'ok',
        detail: {
          policy: 'canDeleteAnyBlogPost',
          scope: 'own',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'INSERT INTO "public"."AuditLog" ("id","tenantId","model","operation","recordId","data","userId","impersonatedBy","hash","previousHash","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING "public"."AuditLog"."id", "public"."AuditLog"."sequence", "public"."AuditLog"."tenantId", "public"."AuditLog"."model", "public"."AuditLog"."operation", "public"."AuditLog"."recordId", "public"."AuditLog"."data", "public"."AuditLog"."userId", "public"."AuditLog"."impersonatedBy", "public"."AuditLog"."hash", "public"."AuditLog"."previousHash", "public"."AuditLog"."createdAt", "public"."AuditLog"."redactedAt"',
          params:
            '["cxmpl00000000000000000017","default","BlogPost","update","cxmpl00000000000000000016","{\\"id\\":\\"cxmpl00000000000000000016\\",\\"tenantId\\":\\"default\\",\\"ownerId\\":\\"cxmpl00000000000000000001\\",\\"title\\":\\"Hello world\\",\\"slug\\":\\"hello-world-3\\",\\"summary\\":null,\\"body\\":null,\\"privateNote\\":null,\\"createdAt\\":\\"2026-01-15T09:00:07.000Z\\",\\"updatedAt\\":\\"2026-01-15T09:00:07.000Z\\",\\"deletedAt\\":\\"2026-01-15T09:00:07.000Z\\"}","cxmpl00000000000000000001",null,"0000000000000000000000000000000000000000000000000000000000000007","0000000000000000000000000000000000000000000000000000000000000008","2026-01-15T09:00:07.000Z"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'INSERT INTO "public"."OutboxMessage" ("id","tenantId","name","payload","status","attempts","nextAttemptAt","createdAt","locale") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          params:
            '["cxmpl00000000000000000018","default","model.deleted","{\\"model\\":\\"BlogPost\\",\\"kind\\":\\"deleted\\",\\"recordId\\":\\"cxmpl00000000000000000016\\",\\"tenantId\\":\\"default\\",\\"changedFields\\":[\\"deletedAt\\"],\\"ownerId\\":\\"cxmpl00000000000000000001\\",\\"teamId\\":null,\\"userId\\":\\"cxmpl00000000000000000001\\",\\"impersonatedBy\\":null}","pending","0","2026-01-15T09:00:07.000Z","2026-01-15T09:00:07.000Z","en"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."AuditLog"."id", "public"."AuditLog"."sequence", "public"."AuditLog"."tenantId", "public"."AuditLog"."model", "public"."AuditLog"."operation", "public"."AuditLog"."recordId", "public"."AuditLog"."data", "public"."AuditLog"."userId", "public"."AuditLog"."impersonatedBy", "public"."AuditLog"."hash", "public"."AuditLog"."previousHash", "public"."AuditLog"."createdAt", "public"."AuditLog"."redactedAt" FROM "public"."AuditLog" WHERE "public"."AuditLog"."tenantId" = $1 ORDER BY "public"."AuditLog"."sequence" DESC LIMIT $2 OFFSET $3',
          params: '["default","1","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."id" = $1 AND "public"."BlogPost"."tenantId" = $2) LIMIT $3 OFFSET $4',
          params: '["cxmpl00000000000000000016","default","1","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT pg_advisory_xact_lock(hashtext($1))',
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'UPDATE "public"."BlogPost" SET "deletedAt" = $1, "updatedAt" = $2 WHERE ("public"."BlogPost"."id" = $3 AND "public"."BlogPost"."tenantId" = $4) RETURNING "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt"',
          params:
            '["2026-01-15T09:00:07.000Z","2026-01-15T09:00:07.000Z","cxmpl00000000000000000016","default"]',
        },
      },
      {
        stage: 'controller',
        label: 'BlogPostController.remove',
        status: 'ok',
      },
    ],
  },
  {
    id: 'hard',
    label: 'Hard delete',
    method: 'POST',
    path: '/blog-posts/delete',
    request:
      'POST /blog-posts/delete\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  "ids": [\n    "cxmpl00000000000000000019"\n  ],\n  "mode": "hard"\n}',
    response:
      '{\n  "data": [\n    {\n      "index": 0,\n      "id": "cxmpl00000000000000000019",\n      "status": "ok",\n      "data": null\n    }\n  ],\n  "meta": {\n    "total": 1,\n    "succeeded": 1,\n    "failed": 0\n  },\n  "messages": []\n}',
    flow: [
      {
        stage: 'middleware',
        label: 'tenant resolution',
        status: 'ok',
        detail: {
          tenantId: 'default',
        },
      },
      {
        stage: 'guard',
        label: 'session',
        status: 'ok',
        detail: {
          userId: 'cxmpl00000000000000000020',
        },
      },
      {
        stage: 'guard',
        label: 'capability',
        status: 'ok',
        detail: {
          policy: 'canDeleteAnyBlogPost',
          scope: 'own',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'DELETE FROM "public"."BlogPost" WHERE ("public"."BlogPost"."id" = $1 AND "public"."BlogPost"."tenantId" = $2) RETURNING "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt"',
          params: '["cxmpl00000000000000000019","default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'INSERT INTO "public"."AuditLog" ("id","tenantId","model","operation","recordId","data","userId","impersonatedBy","hash","previousHash","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING "public"."AuditLog"."id", "public"."AuditLog"."sequence", "public"."AuditLog"."tenantId", "public"."AuditLog"."model", "public"."AuditLog"."operation", "public"."AuditLog"."recordId", "public"."AuditLog"."data", "public"."AuditLog"."userId", "public"."AuditLog"."impersonatedBy", "public"."AuditLog"."hash", "public"."AuditLog"."previousHash", "public"."AuditLog"."createdAt", "public"."AuditLog"."redactedAt"',
          params:
            '["cxmpl00000000000000000021","default","BlogPost","delete","cxmpl00000000000000000019","{\\"id\\":\\"cxmpl00000000000000000019\\",\\"tenantId\\":\\"default\\",\\"ownerId\\":\\"cxmpl00000000000000000020\\",\\"title\\":\\"Gone for good\\",\\"slug\\":\\"gone-for-good\\",\\"summary\\":null,\\"body\\":null,\\"privateNote\\":null,\\"createdAt\\":\\"2026-01-15T09:00:08.000Z\\",\\"updatedAt\\":\\"2026-01-15T09:00:08.000Z\\",\\"deletedAt\\":null}","cxmpl00000000000000000020",null,"0000000000000000000000000000000000000000000000000000000000000009","0000000000000000000000000000000000000000000000000000000000000010","2026-01-15T09:00:08.000Z"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'INSERT INTO "public"."OutboxMessage" ("id","tenantId","name","payload","status","attempts","nextAttemptAt","createdAt","locale") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          params:
            '["cxmpl00000000000000000022","default","model.deleted","{\\"model\\":\\"BlogPost\\",\\"kind\\":\\"deleted\\",\\"recordId\\":\\"cxmpl00000000000000000019\\",\\"tenantId\\":\\"default\\",\\"changedFields\\":[],\\"ownerId\\":\\"cxmpl00000000000000000020\\",\\"teamId\\":null,\\"userId\\":\\"cxmpl00000000000000000020\\",\\"impersonatedBy\\":null}","pending","0","2026-01-15T09:00:08.000Z","2026-01-15T09:00:08.000Z","en"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."AuditLog"."id", "public"."AuditLog"."sequence", "public"."AuditLog"."tenantId", "public"."AuditLog"."model", "public"."AuditLog"."operation", "public"."AuditLog"."recordId", "public"."AuditLog"."data", "public"."AuditLog"."userId", "public"."AuditLog"."impersonatedBy", "public"."AuditLog"."hash", "public"."AuditLog"."previousHash", "public"."AuditLog"."createdAt", "public"."AuditLog"."redactedAt" FROM "public"."AuditLog" WHERE "public"."AuditLog"."tenantId" = $1 ORDER BY "public"."AuditLog"."sequence" DESC LIMIT $2 OFFSET $3',
          params: '["default","1","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."id" = $1 AND "public"."BlogPost"."tenantId" = $2) LIMIT $3 OFFSET $4',
          params: '["cxmpl00000000000000000019","default","1","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT pg_advisory_xact_lock(hashtext($1))',
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'controller',
        label: 'BlogPostController.remove',
        status: 'ok',
      },
    ],
  },
];

export const restoreScenarios: PlaygroundScenario[] = [
  {
    id: 'restore',
    label: 'Restore',
    method: 'POST',
    path: '/blog-posts/restore',
    request:
      'POST /blog-posts/restore\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  "ids": [\n    "cxmpl00000000000000000023"\n  ]\n}',
    response:
      '{\n  "data": [\n    {\n      "index": 0,\n      "id": "cxmpl00000000000000000023",\n      "status": "ok",\n      "data": {\n        "id": "cxmpl00000000000000000023",\n        "tenantId": "default",\n        "ownerId": "cxmpl00000000000000000001",\n        "title": "Hello world",\n        "slug": "hello-world-4",\n        "summary": null,\n        "summaryTranslations": {},\n        "body": null,\n        "createdAt": "2026-01-15T09:00:09.000Z",\n        "updatedAt": "2026-01-15T09:00:09.000Z",\n        "deletedAt": null\n      }\n    }\n  ],\n  "meta": {\n    "total": 1,\n    "succeeded": 1,\n    "failed": 0\n  },\n  "messages": []\n}',
    flow: [
      {
        stage: 'middleware',
        label: 'tenant resolution',
        status: 'ok',
        detail: {
          tenantId: 'default',
        },
      },
      {
        stage: 'guard',
        label: 'session',
        status: 'ok',
        detail: {
          userId: 'cxmpl00000000000000000001',
        },
      },
      {
        stage: 'guard',
        label: 'capability',
        status: 'ok',
        detail: {
          policy: 'canRestoreAnyBlogPost',
          scope: 'own',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'INSERT INTO "public"."AuditLog" ("id","tenantId","model","operation","recordId","data","userId","impersonatedBy","hash","previousHash","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING "public"."AuditLog"."id", "public"."AuditLog"."sequence", "public"."AuditLog"."tenantId", "public"."AuditLog"."model", "public"."AuditLog"."operation", "public"."AuditLog"."recordId", "public"."AuditLog"."data", "public"."AuditLog"."userId", "public"."AuditLog"."impersonatedBy", "public"."AuditLog"."hash", "public"."AuditLog"."previousHash", "public"."AuditLog"."createdAt", "public"."AuditLog"."redactedAt"',
          params:
            '["cxmpl00000000000000000024","default","BlogPost","update","cxmpl00000000000000000023","{\\"id\\":\\"cxmpl00000000000000000023\\",\\"tenantId\\":\\"default\\",\\"ownerId\\":\\"cxmpl00000000000000000001\\",\\"title\\":\\"Hello world\\",\\"slug\\":\\"hello-world-4\\",\\"summary\\":null,\\"body\\":null,\\"privateNote\\":null,\\"createdAt\\":\\"2026-01-15T09:00:09.000Z\\",\\"updatedAt\\":\\"2026-01-15T09:00:09.000Z\\",\\"deletedAt\\":null}","cxmpl00000000000000000001",null,"0000000000000000000000000000000000000000000000000000000000000011","0000000000000000000000000000000000000000000000000000000000000012","2026-01-15T09:00:09.000Z"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'INSERT INTO "public"."OutboxMessage" ("id","tenantId","name","payload","status","attempts","nextAttemptAt","createdAt","locale") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          params:
            '["cxmpl00000000000000000025","default","model.updated","{\\"model\\":\\"BlogPost\\",\\"kind\\":\\"updated\\",\\"recordId\\":\\"cxmpl00000000000000000023\\",\\"tenantId\\":\\"default\\",\\"changedFields\\":[\\"deletedAt\\"],\\"ownerId\\":\\"cxmpl00000000000000000001\\",\\"teamId\\":null,\\"userId\\":\\"cxmpl00000000000000000001\\",\\"impersonatedBy\\":null}","pending","0","2026-01-15T09:00:09.000Z","2026-01-15T09:00:09.000Z","en"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."AuditLog"."id", "public"."AuditLog"."sequence", "public"."AuditLog"."tenantId", "public"."AuditLog"."model", "public"."AuditLog"."operation", "public"."AuditLog"."recordId", "public"."AuditLog"."data", "public"."AuditLog"."userId", "public"."AuditLog"."impersonatedBy", "public"."AuditLog"."hash", "public"."AuditLog"."previousHash", "public"."AuditLog"."createdAt", "public"."AuditLog"."redactedAt" FROM "public"."AuditLog" WHERE "public"."AuditLog"."tenantId" = $1 ORDER BY "public"."AuditLog"."sequence" DESC LIMIT $2 OFFSET $3',
          params: '["default","1","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."id" = $1 AND "public"."BlogPost"."tenantId" = $2) LIMIT $3 OFFSET $4',
          params: '["cxmpl00000000000000000023","default","1","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT pg_advisory_xact_lock(hashtext($1))',
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'UPDATE "public"."BlogPost" SET "deletedAt" = $1, "updatedAt" = $2 WHERE ("public"."BlogPost"."id" = $3 AND "public"."BlogPost"."tenantId" = $4) RETURNING "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt"',
          params:
            '[null,"2026-01-15T09:00:09.000Z","cxmpl00000000000000000023","default"]',
        },
      },
      {
        stage: 'controller',
        label: 'BlogPostController.restore',
        status: 'ok',
      },
    ],
  },
  {
    id: 'restore-with-patch',
    label: 'Restore with a fix',
    method: 'POST',
    path: '/blog-posts/restore',
    request:
      'POST /blog-posts/restore\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  "ids": [\n    "cxmpl00000000000000000026"\n  ],\n  "patch": {\n    "title": "Hello world (restored)"\n  }\n}',
    response:
      '{\n  "data": [\n    {\n      "index": 0,\n      "id": "cxmpl00000000000000000026",\n      "status": "ok",\n      "data": {\n        "id": "cxmpl00000000000000000026",\n        "tenantId": "default",\n        "ownerId": "cxmpl00000000000000000001",\n        "title": "Hello world (restored)",\n        "slug": "hello-world-restored",\n        "summary": null,\n        "summaryTranslations": {},\n        "body": null,\n        "createdAt": "2026-01-15T09:00:10.000Z",\n        "updatedAt": "2026-01-15T09:00:10.000Z",\n        "deletedAt": null\n      }\n    }\n  ],\n  "meta": {\n    "total": 1,\n    "succeeded": 1,\n    "failed": 0\n  },\n  "messages": []\n}',
    flow: [
      {
        stage: 'middleware',
        label: 'tenant resolution',
        status: 'ok',
        detail: {
          tenantId: 'default',
        },
      },
      {
        stage: 'guard',
        label: 'session',
        status: 'ok',
        detail: {
          userId: 'cxmpl00000000000000000001',
        },
      },
      {
        stage: 'guard',
        label: 'capability',
        status: 'ok',
        detail: {
          policy: 'canRestoreAnyBlogPost',
          scope: 'own',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'INSERT INTO "public"."AuditLog" ("id","tenantId","model","operation","recordId","data","userId","impersonatedBy","hash","previousHash","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING "public"."AuditLog"."id", "public"."AuditLog"."sequence", "public"."AuditLog"."tenantId", "public"."AuditLog"."model", "public"."AuditLog"."operation", "public"."AuditLog"."recordId", "public"."AuditLog"."data", "public"."AuditLog"."userId", "public"."AuditLog"."impersonatedBy", "public"."AuditLog"."hash", "public"."AuditLog"."previousHash", "public"."AuditLog"."createdAt", "public"."AuditLog"."redactedAt"',
          params:
            '["cxmpl00000000000000000027","default","BlogPost","update","cxmpl00000000000000000026","{\\"id\\":\\"cxmpl00000000000000000026\\",\\"tenantId\\":\\"default\\",\\"ownerId\\":\\"cxmpl00000000000000000001\\",\\"title\\":\\"Hello world (restored)\\",\\"slug\\":\\"hello-world-restored\\",\\"summary\\":null,\\"body\\":null,\\"privateNote\\":null,\\"createdAt\\":\\"2026-01-15T09:00:10.000Z\\",\\"updatedAt\\":\\"2026-01-15T09:00:10.000Z\\",\\"deletedAt\\":null}","cxmpl00000000000000000001",null,"0000000000000000000000000000000000000000000000000000000000000013","0000000000000000000000000000000000000000000000000000000000000014","2026-01-15T09:00:10.000Z"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'INSERT INTO "public"."OutboxMessage" ("id","tenantId","name","payload","status","attempts","nextAttemptAt","createdAt","locale") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          params:
            '["cxmpl00000000000000000028","default","model.updated","{\\"model\\":\\"BlogPost\\",\\"kind\\":\\"updated\\",\\"recordId\\":\\"cxmpl00000000000000000026\\",\\"tenantId\\":\\"default\\",\\"changedFields\\":[\\"title\\",\\"slug\\",\\"deletedAt\\"],\\"ownerId\\":\\"cxmpl00000000000000000001\\",\\"teamId\\":null,\\"userId\\":\\"cxmpl00000000000000000001\\",\\"impersonatedBy\\":null}","pending","0","2026-01-15T09:00:10.000Z","2026-01-15T09:00:10.000Z","en"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."AuditLog"."id", "public"."AuditLog"."sequence", "public"."AuditLog"."tenantId", "public"."AuditLog"."model", "public"."AuditLog"."operation", "public"."AuditLog"."recordId", "public"."AuditLog"."data", "public"."AuditLog"."userId", "public"."AuditLog"."impersonatedBy", "public"."AuditLog"."hash", "public"."AuditLog"."previousHash", "public"."AuditLog"."createdAt", "public"."AuditLog"."redactedAt" FROM "public"."AuditLog" WHERE "public"."AuditLog"."tenantId" = $1 ORDER BY "public"."AuditLog"."sequence" DESC LIMIT $2 OFFSET $3',
          params: '["default","1","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."BlogPost"."id", "public"."BlogPost"."slug" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."slug"::text LIKE ($1 || \'%\') AND "public"."BlogPost"."tenantId" = $2) ORDER BY "public"."BlogPost"."id" ASC LIMIT $3 OFFSET $4',
          params: '["hello-world-restored","default","1000","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."id" = $1 AND "public"."BlogPost"."tenantId" = $2) LIMIT $3 OFFSET $4',
          params: '["cxmpl00000000000000000026","default","1","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT pg_advisory_xact_lock(hashtext($1))',
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'UPDATE "public"."BlogPost" SET "title" = $1, "slug" = $2, "deletedAt" = $3, "updatedAt" = $4 WHERE ("public"."BlogPost"."id" = $5 AND "public"."BlogPost"."tenantId" = $6) RETURNING "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt"',
          params:
            '["Hello world (restored)","hello-world-restored",null,"2026-01-15T09:00:10.000Z","cxmpl00000000000000000026","default"]',
        },
      },
      {
        stage: 'controller',
        label: 'BlogPostController.restore',
        status: 'ok',
      },
    ],
  },
];

export const detailsScenarios: PlaygroundScenario[] = [
  {
    id: 'read-one',
    label: 'Read one record',
    method: 'POST',
    path: '/blog-posts/search',
    request:
      'POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  "filters": [\n    {\n      "field": "id",\n      "value": "cxmpl00000000000000000029"\n    }\n  ]\n}',
    response:
      '{\n  "data": [\n    {\n      "id": "cxmpl00000000000000000029",\n      "tenantId": "default",\n      "ownerId": "cxmpl00000000000000000001",\n      "title": "Hello world",\n      "slug": "hello-world-5",\n      "summary": null,\n      "summaryTranslations": {},\n      "body": null,\n      "createdAt": "2026-01-15T09:00:11.000Z",\n      "updatedAt": "2026-01-15T09:00:11.000Z",\n      "deletedAt": null\n    }\n  ],\n  "meta": {\n    "channels": [\n      "blogPost"\n    ],\n    "page": 1,\n    "limit": 15,\n    "last_page": 1,\n    "next_cursor": null,\n    "total": 1\n  },\n  "messages": []\n}',
    flow: [
      {
        stage: 'middleware',
        label: 'tenant resolution',
        status: 'ok',
        detail: {
          tenantId: 'default',
        },
      },
      {
        stage: 'guard',
        label: 'session',
        status: 'ok',
        detail: {
          userId: 'cxmpl00000000000000000001',
        },
      },
      {
        stage: 'guard',
        label: 'capability',
        status: 'ok',
        detail: {
          policy: 'canViewAnyBlogPost',
          scope: 'own',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'COMMIT',
          params: '[]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT COUNT(*) AS "_count$_all" FROM (SELECT "public"."BlogPost"."id" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."ownerId" = $1 AND "public"."BlogPost"."deletedAt" IS NULL AND "public"."BlogPost"."id" = $2 AND "public"."BlogPost"."tenantId" = $3) OFFSET $4) AS "sub"',
          params:
            '["cxmpl00000000000000000001","cxmpl00000000000000000029","default","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: 'SELECT "public"."BlogPost"."id", "public"."BlogPost"."tenantId", "public"."BlogPost"."ownerId", "public"."BlogPost"."title", "public"."BlogPost"."slug", "public"."BlogPost"."summary", "public"."BlogPost"."body", "public"."BlogPost"."privateNote", "public"."BlogPost"."createdAt", "public"."BlogPost"."updatedAt", "public"."BlogPost"."deletedAt" FROM "public"."BlogPost" WHERE ("public"."BlogPost"."ownerId" = $1 AND "public"."BlogPost"."deletedAt" IS NULL AND "public"."BlogPost"."id" = $2 AND "public"."BlogPost"."tenantId" = $3) ORDER BY "public"."BlogPost"."createdAt" DESC, "public"."BlogPost"."id" DESC LIMIT $4 OFFSET $5',
          params:
            '["cxmpl00000000000000000001","cxmpl00000000000000000029","default","15","0"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'prisma',
        label: 'query',
        status: 'ok',
        detail: {
          sql: "SELECT set_config('app.tenant_id', $1, true)",
          params: '["default"]',
        },
      },
      {
        stage: 'controller',
        label: 'BlogPostController.search',
        status: 'ok',
      },
    ],
  },
  {
    id: 'describe',
    label: 'The resource contract',
    method: 'GET',
    path: '/blog-posts/describe',
    request: 'GET /blog-posts/describe\nAuthorization: Bearer <token>',
    response:
      '{\n  "data": {\n    "version": 1,\n    "fields": [\n      {\n        "name": "title",\n        "type": "string",\n        "optional": false\n      },\n      {\n        "name": "slug",\n        "type": "slug",\n        "optional": false,\n        "slug": {\n          "source": "title",\n          "stable": false\n        }\n      },\n      {\n        "name": "summary",\n        "type": "string",\n        "optional": true,\n        "translatable": true\n      },\n      {\n        "name": "body",\n        "type": "richtext",\n        "optional": true,\n        "richtext": {\n          "maxLength": 20000,\n          "allow": {\n            "tags": [\n              "p",\n              "br",\n              "hr",\n              "strong",\n              "b",\n              "em",\n              "i",\n              "u",\n              "s",\n              "code",\n              "pre",\n              "blockquote",\n              "ul",\n              "ol",\n              "li",\n              "h1",\n              "h2",\n              "h3",\n              "h4",\n              "a"\n            ],\n            "attributes": {\n              "a": [\n                "href",\n                "title"\n              ]\n            },\n            "schemes": [\n              "http",\n              "https",\n              "mailto"\n            ]\n          }\n        }\n      },\n      {\n        "name": "privateNote",\n        "type": "encrypted",\n        "optional": true\n      }\n    ],\n    "locales": {\n      "supported": [\n        "en",\n        "fr"\n      ],\n      "default": "en",\n      "fallbacks": {\n        "fr": [\n          "en"\n        ]\n      }\n    },\n    "sorts": [\n      "createdAt",\n      "summary"\n    ],\n    "filters": [\n      "id",\n      "title",\n      "slug",\n      "summary"\n    ],\n    "selects": [\n      "id",\n      "ownerId",\n      "title",\n      "slug",\n      "summary",\n      "summaryTranslations",\n      "body",\n      "createdAt",\n      "updatedAt",\n      "deletedAt"\n    ],\n    "translatable": [\n      "summary"\n    ],\n    "includes": {\n      "notes": {\n        "type": "hasMany",\n        "foreignKey": "blogPostId",\n        "childDelegate": "blogPostNote",\n        "filters": [\n          "body"\n        ],\n        "sorts": [\n          "createdAt"\n        ],\n        "selects": [\n          "id",\n          "body",\n          "rating",\n          "createdAt"\n        ]\n      },\n      "comments": {\n        "type": "morphMany",\n        "foreignKey": "commentableId",\n        "discriminator": "commentableType",\n        "discriminatorValue": "BlogPost",\n        "childDelegate": "comment",\n        "filters": [\n          "body"\n        ],\n        "sorts": [\n          "createdAt"\n        ],\n        "selects": [\n          "id",\n          "body",\n          "createdAt"\n        ]\n      }\n    },\n    "aggregates": {\n      "notes": {\n        "type": "hasMany",\n        "foreignKey": "blogPostId",\n        "childDelegate": "blogPostNote",\n        "filters": [\n          "body"\n        ],\n        "fields": [\n          "rating"\n        ]\n      },\n      "comments": {\n        "type": "morphMany",\n        "foreignKey": "commentableId",\n        "discriminator": "commentableType",\n        "discriminatorValue": "BlogPost",\n        "childDelegate": "comment",\n        "filters": [\n          "body"\n        ],\n        "fields": []\n      }\n    },\n    "limits": [\n      10,\n      15,\n      20\n    ],\n    "defaultLimit": 15,\n    "paginated": true,\n    "softDeletes": true,\n    "relations": [\n      "tags"\n    ],\n    "rules": {\n      "create": {\n        "$schema": "https://json-schema.org/draft/2020-12/schema",\n        "type": "object",\n        "properties": {\n          "title": {\n            "type": "string",\n            "minLength": 1,\n            "maxLength": 255\n          },\n          "slug": {\n            "type": "string",\n            "minLength": 1,\n            "maxLength": 100,\n            "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$"\n          },\n          "summary": {\n            "anyOf": [\n              {\n                "type": "string",\n                "minLength": 1,\n                "maxLength": 255\n              },\n              {\n                "type": "object",\n                "propertyNames": {\n                  "type": "string"\n                },\n                "additionalProperties": {\n                  "anyOf": [\n                    {\n                      "type": "string",\n                      "minLength": 1,\n                      "maxLength": 255\n                    },\n                    {\n                      "type": "null"\n                    }\n                  ]\n                }\n              }\n            ]\n          },\n          "body": {\n            "type": "string",\n            "minLength": 1,\n            "maxLength": 20000\n          },\n          "privateNote": {\n            "type": "string",\n            "minLength": 1,\n            "maxLength": 4096\n          }\n        },\n        "required": [\n          "title"\n        ],\n        "additionalProperties": false\n      },\n      "update": {\n        "$schema": "https://json-schema.org/draft/2020-12/schema",\n        "type": "object",\n        "properties": {\n          "title": {\n            "type": "string",\n            "minLength": 1,\n            "maxLength": 255\n          },\n          "slug": {\n            "type": "string",\n            "minLength": 1,\n            "maxLength": 100,\n            "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$"\n          },\n          "summary": {\n            "anyOf": [\n              {\n                "type": "string",\n                "minLength": 1,\n                "maxLength": 255\n              },\n              {\n                "type": "object",\n                "propertyNames": {\n                  "type": "string"\n                },\n                "additionalProperties": {\n                  "anyOf": [\n                    {\n                      "type": "string",\n                      "minLength": 1,\n                      "maxLength": 255\n                    },\n                    {\n                      "type": "null"\n                    }\n                  ]\n                }\n              }\n            ]\n          },\n          "body": {\n            "type": "string",\n            "minLength": 1,\n            "maxLength": 20000\n          },\n          "privateNote": {\n            "type": "string",\n            "minLength": 1,\n            "maxLength": 4096\n          }\n        },\n        "additionalProperties": false\n      }\n    }\n  },\n  "messages": []\n}',
    flow: [
      {
        stage: 'middleware',
        label: 'tenant resolution',
        status: 'ok',
        detail: {
          tenantId: 'default',
        },
      },
      {
        stage: 'guard',
        label: 'session',
        status: 'ok',
        detail: {
          userId: 'cxmpl00000000000000000001',
        },
      },
      {
        stage: 'guard',
        label: 'capability',
        status: 'ok',
        detail: {
          policy: 'canViewAnyBlogPost',
          scope: 'own',
        },
      },
      {
        stage: 'controller',
        label: 'BlogPostController.describe',
        status: 'ok',
      },
    ],
  },
];

export const resourceCode = {
  search:
    "@Post('search')\n  @HttpCode(200)\n  @Capability(canViewAnyBlogPost)\n  @CacheableRead()\n  async search(\n    @Req() req: RequestWithUser,\n    @Body(new ZodValidationPipe(searchRequestSchema)) body: SearchRequestBody,\n  ) {\n    const query = parseSearchRequest(body, BLOG_POST_CONTRACT);\n    const subject = subjectOf(req.user);\n\n    if (query.withTrashed || query.onlyTrashed) {\n      const trashedDecision = canListTrashedBlogPost(subject);\n\n      if (!trashedDecision.allowed) {\n        throw new CapabilityForbiddenException(trashedDecision);\n      }\n    }\n\n    const { records, total, matches } = await this.blogPosts.search(\n      subject,\n      query,\n    );\n    const capabilities = body.capabilities ?? [];\n    const select = query.select;\n    const project = (view: Record<string, unknown>) =>\n      select\n        ? Object.fromEntries(\n            Object.entries(view).filter(([key]) => key in select),\n          )\n        : view;\n    const pageLimit = query.limit ?? 15;\n    const meta = {\n      channels: [BLOG_POST_SIGNAL_CHANNEL],\n      page: query.page ?? 1,\n      limit: pageLimit,\n      last_page: Math.max(1, Math.ceil(total / pageLimit)),\n      next_cursor: nextCursorFor(records, query.sorts, pageLimit),\n      total,\n      ...(matches\n        ? {\n            search: { matchLimit: matches.limit, truncated: matches.truncated },\n          }\n        : {}),\n    };\n\n    // A truncated match set makes total a floor rather than a count, so the\n    // response says which one it is instead of leaving the caller to trust a\n    // number that is quietly wrong.\n    const messages = matches?.truncated\n      ? [\n          `Only the first ${matches.limit} full-text matches were counted, and more exist. The totals below are a floor, not a count -- narrow the search term to see the rest.`,\n        ]\n      : [];\n\n    if (capabilities.length === 0) {\n      return ok(\n        records.map((record) =>\n          withIncludesAndAggregates(\n            project(toBlogPostView(record)),\n            record,\n            query,\n          ),\n        ),\n        meta,\n        messages,\n      );\n    }\n\n    return ok(\n      records.map((record) => {\n        const resolved = this.policy.recordCapabilities(subject, record);\n        return {\n          ...withIncludesAndAggregates(\n            project(toBlogPostView(record)),\n            record,\n            query,\n          ),\n          capabilities: Object.fromEntries(\n            Object.entries(resolved).filter(([key]) =>\n              capabilities.includes(key),\n            ),\n          ),\n        };\n      }),\n      {\n        ...meta,\n        capabilities: this.policy.metaCapabilities(subject),\n      },\n      messages,\n    );\n  }",
  create:
    "@Post('create')\n  @Capability(canCreateBlogPost)\n  async create(\n    @Req() req: RequestWithUser,\n    @Body(new ZodValidationPipe(createBlogPostRequestSchema))\n    body: CreateBlogPostRequestBody,\n  ) {\n    const subject = subjectOf(req.user);\n    const entries = body.data.map((item, index): BatchEntry<BlogPostView> => ({\n      index,\n      run: async () =>\n        toBlogPostView(await this.blogPosts.create(subject, item)),\n    }));\n\n    const { results, meta } = await this.runBatch(entries, body.atomic);\n\n    return ok(results, meta);\n  }",
  update:
    "@Post('update')\n  @Capability(canUpdateAnyBlogPost)\n  async update(\n    @Req() req: RequestWithUser,\n    @Body(new ZodValidationPipe(updateBlogPostRequestSchema))\n    body: UpdateBlogPostRequestBody,\n  ) {\n    const subject = subjectOf(req.user);\n    const loaded = await this.loadAndAuthorize(\n      body.data.map((item) => item.id),\n      subject,\n      (s, record) => canUpdateBlogPost(s, record as never),\n    );\n\n    const entries = loaded.map((entry, index): BatchEntry<unknown> => {\n      if (!entry.ok) {\n        return { index, id: entry.id, failure: entry.error };\n      }\n\n      const { id: _id, relations, ...data } = body.data[index]!;\n\n      return {\n        index,\n        id: entry.id,\n        run: async () => {\n          const updated = await this.blogPosts.update(entry.record, data);\n          const relationResults: Record<string, string[]> = {};\n\n          if (relations?.tags) {\n            const { attach, detach, sync } = relations.tags;\n\n            if ((attach && attach.length > 0) || sync) {\n              const decision = canAttachTagsToBlogPost(subject, entry.record);\n              if (!decision.allowed) {\n                throw new CapabilityForbiddenException(decision);\n              }\n            }\n\n            if ((detach && detach.length > 0) || sync) {\n              const decision = canDetachTagsFromBlogPost(subject, entry.record);\n              if (!decision.allowed) {\n                throw new CapabilityForbiddenException(decision);\n              }\n            }\n\n            relationResults.tags = await this.blogPosts.syncTags(\n              entry.record,\n              relations.tags,\n            );\n          }\n\n          return { ...toBlogPostView(updated), ...relationResults };\n        },\n      };\n    });\n\n    const { results, meta } = await this.runBatch(entries, body.atomic);\n\n    return ok(results, meta);\n  }",
  delete:
    "@Post('delete')\n  @Capability(canDeleteAnyBlogPost)\n  async remove(\n    @Req() req: RequestWithUser,\n    @Body(new ZodValidationPipe(deleteBlogPostRequestSchema))\n    body: DeleteBlogPostRequestBody,\n  ) {\n    const subject = subjectOf(req.user);\n    const loaded = await this.loadAndAuthorize(body.ids, subject, (s, record) =>\n      canDeleteBlogPost(s, record as never),\n    );\n\n    if (body.mode === 'hard') {\n      const hardDecision = canHardDeleteBlogPost(subject);\n\n      if (!hardDecision.allowed) {\n        throw new CapabilityForbiddenException(hardDecision);\n      }\n    }\n\n    const entries = loaded.map(\n      (entry, index): BatchEntry<BlogPostView | null> => {\n        if (!entry.ok) {\n          return { index, id: entry.id, failure: entry.error };\n        }\n\n        return {\n          index,\n          id: entry.id,\n          run: async () => {\n            if (body.mode === 'hard') {\n              await this.blogPosts.hardDelete(entry.record);\n              return null;\n            }\n\n            return toBlogPostView(\n              await this.blogPosts.softDelete(entry.record),\n            );\n          },\n        };\n      },\n    );\n\n    const { results, meta } = await this.runBatch(entries, body.atomic);\n\n    return ok(results, meta);\n  }",
  restore:
    "@Post('restore')\n  @Capability(canRestoreAnyBlogPost)\n  async restore(\n    @Req() req: RequestWithUser,\n    @Body(new ZodValidationPipe(restoreBlogPostRequestSchema))\n    body: RestoreBlogPostRequestBody,\n  ) {\n    const subject = subjectOf(req.user);\n    const loaded = await this.loadAndAuthorize(body.ids, subject, (s, record) =>\n      canRestoreBlogPost(s, record as never),\n    );\n\n    const entries = loaded.map((entry, index): BatchEntry<BlogPostView> => {\n      if (!entry.ok) {\n        return { index, id: entry.id, failure: entry.error };\n      }\n\n      return {\n        index,\n        id: entry.id,\n        run: async () => {\n          if (!entry.record.deletedAt) {\n            throw new AlreadyRestoredException('blog-post');\n          }\n\n          return toBlogPostView(\n            await this.blogPosts.restore(entry.record, body.patch),\n          );\n        },\n      };\n    });\n\n    const { results, meta } = await this.runBatch(entries, body.atomic);\n\n    return ok(results, meta);\n  }",
  describe:
    "@Get('describe')\n  @Capability(canViewAnyBlogPost)\n  @CacheableRead()\n  describe() {\n    return ok(BLOG_POST_DESCRIBE);\n  }",
};
