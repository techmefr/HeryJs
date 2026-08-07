import type { PlaygroundScenario } from './scenario-types';

export const searchScenarios: PlaygroundScenario[] = [
  {
    "id": "filter",
    "label": "Filtrer sur le titre",
    "method": "POST",
    "path": "/blog-posts/search",
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"filters\": [\n    {\n      \"field\": \"title\",\n      \"operator\": \"like\",\n      \"value\": \"hello\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 15,\n    \"last_page\": 1,\n    \"total\": 0\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 9.318652,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.036813,
        "detail": {
          "userId": "cmsikprcg0000wmvo12u618yd"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.06544,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 15.818188999997801,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"title\"::text LIKE ('%' || $2 || '%') AND \"public\".\"BlogPost\".\"tenantId\" = $3) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $4 OFFSET $5",
          "params": "[\"cmsikprcg0000wmvo12u618yd\",\"hello\",\"default\",\"15\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 15.782609000001685,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"title\"::text LIKE ('%' || $2 || '%') AND \"public\".\"BlogPost\".\"tenantId\" = $3) OFFSET $4) AS \"sub\"",
          "params": "[\"cmsikprcg0000wmvo12u618yd\",\"hello\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 27.80488
      }
    ]
  },
  {
    "id": "sort-paginate",
    "label": "Trier et paginer",
    "method": "POST",
    "path": "/blog-posts/search",
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"sorts\": [\n    {\n      \"field\": \"createdAt\",\n      \"direction\": \"desc\"\n    }\n  ],\n  \"page\": 1,\n  \"limit\": 10\n}",
    "response": "{\n  \"data\": [\n    {\n      \"id\": \"cmsikpsfh000cwmvotv6hersh\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmsikprcg0000wmvo12u618yd\",\n      \"title\": \"Changelog\",\n      \"createdAt\": \"2026-08-07T06:38:22.253Z\",\n      \"updatedAt\": \"2026-08-07T06:38:22.253Z\",\n      \"deletedAt\": null\n    },\n    {\n      \"id\": \"cmsikpseb000awmvo50lz1sb5\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmsikprcg0000wmvo12u618yd\",\n      \"title\": \"Release notes\",\n      \"createdAt\": \"2026-08-07T06:38:22.211Z\",\n      \"updatedAt\": \"2026-08-07T06:38:22.211Z\",\n      \"deletedAt\": null\n    },\n    {\n      \"id\": \"cmsikpsb70008wmvo7zngp26b\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmsikprcg0000wmvo12u618yd\",\n      \"title\": \"Hello world\",\n      \"createdAt\": \"2026-08-07T06:38:22.099Z\",\n      \"updatedAt\": \"2026-08-07T06:38:22.099Z\",\n      \"deletedAt\": null\n    }\n  ],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 10,\n    \"last_page\": 1,\n    \"total\": 3\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 10.200118,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.067185,
        "detail": {
          "userId": "cmsikprcg0000wmvo12u618yd"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.024721,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.6874919999972917,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"tenantId\" = $2) OFFSET $3) AS \"sub\"",
          "params": "[\"cmsikprcg0000wmvo12u618yd\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.844107000000804,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"tenantId\" = $2) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $3 OFFSET $4",
          "params": "[\"cmsikprcg0000wmvo12u618yd\",\"default\",\"10\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 5.538104
      }
    ]
  },
  {
    "id": "by-id",
    "label": "Chercher par identifiant",
    "method": "POST",
    "path": "/blog-posts/search",
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"filters\": [\n    {\n      \"field\": \"id\",\n      \"value\": \"cmsikpsh0000ewmvo6svl1tya\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"id\": \"cmsikpsh0000ewmvo6svl1tya\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmsikprcg0000wmvo12u618yd\",\n      \"title\": \"Fetched by id\",\n      \"createdAt\": \"2026-08-07T06:38:22.308Z\",\n      \"updatedAt\": \"2026-08-07T06:38:22.308Z\",\n      \"deletedAt\": null\n    }\n  ],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 15,\n    \"last_page\": 1,\n    \"total\": 1\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 8.53057,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.059298,
        "detail": {
          "userId": "cmsikprcg0000wmvo12u618yd"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.034169,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.8953099999998813,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $4 OFFSET $5",
          "params": "[\"cmsikprcg0000wmvo12u618yd\",\"cmsikpsh0000ewmvo6svl1tya\",\"default\",\"15\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.8229400000018359,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) OFFSET $4) AS \"sub\"",
          "params": "[\"cmsikprcg0000wmvo12u618yd\",\"cmsikpsh0000ewmvo6svl1tya\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 5.499262
      }
    ]
  }
];

export const createScenarios: PlaygroundScenario[] = [
  {
    "id": "create",
    "label": "Créer un article",
    "method": "POST",
    "path": "/blog-posts/create",
    "request": "POST /blog-posts/create\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"data\": [\n    {\n      \"title\": \"Hello world\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsikpsic000gwmvo6frg6ip5\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsikprcg0000wmvo12u618yd\",\n        \"title\": \"Hello world\",\n        \"createdAt\": \"2026-08-07T06:38:22.356Z\",\n        \"updatedAt\": \"2026-08-07T06:38:22.356Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 8.139578,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.037254,
        "detail": {
          "userId": "cmsikprcg0000wmvo12u618yd"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.020518,
        "detail": {
          "policy": "canCreateBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 4.457366999999067,
        "detail": {
          "sql": "INSERT INTO \"public\".\"BlogPost\" (\"id\",\"tenantId\",\"ownerId\",\"title\",\"createdAt\",\"updatedAt\") VALUES ($1,$2,$3,$4,$5,$6) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"cmsikpsic000gwmvo6frg6ip5\",\"default\",\"cmsikprcg0000wmvo12u618yd\",\"Hello world\",\"2026-08-07T06:38:22.356Z\",\"2026-08-07T06:38:22.356Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7300380000015139,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.0729350000001432,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.2618440000005648,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsikpsil000hwmvo9cukoqmj\",\"default\",\"BlogPost\",\"create\",\"cmsikpsic000gwmvo6frg6ip5\",\"{\\\"id\\\":\\\"cmsikpsic000gwmvo6frg6ip5\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsikprcg0000wmvo12u618yd\\\",\\\"title\\\":\\\"Hello world\\\",\\\"createdAt\\\":\\\"2026-08-07T06:38:22.356Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T06:38:22.356Z\\\",\\\"deletedAt\\\":null}\",\"cmsikprcg0000wmvo12u618yd\",null,\"f5dd241bf825fc3f556726d7e46144aeadce38f7b83ed5381e392497386e66cb\",\"8cbc01b92d7805e50428acc6ce9b54163a972b0de9ed47fdefd9bf8e98513b28\",\"2026-08-07T06:38:22.365Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 5.658630999998422,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.create",
        "status": "ok",
        "durationMs": 17.568977
      }
    ]
  },
  {
    "id": "validation-failed",
    "label": "Payload invalide",
    "method": "POST",
    "path": "/blog-posts/create",
    "request": "POST /blog-posts/create\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"data\": [\n    {}\n  ]\n}",
    "response": "{\n  \"error\": {\n    \"status\": 400,\n    \"key\": \"http.error\",\n    \"message\": \"Bad Request Exception\",\n    \"details\": {\n      \"formErrors\": [],\n      \"fieldErrors\": {\n        \"data\": [\n          \"Invalid input: expected string, received undefined\"\n        ]\n      }\n    }\n  }\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 8.183716,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.037763,
        "detail": {
          "userId": "cmsikprcg0000wmvo12u618yd"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.021288,
        "detail": {
          "policy": "canCreateBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.create",
        "status": "error",
        "durationMs": 1.776171,
        "detail": {
          "message": "Bad Request Exception"
        }
      }
    ]
  }
];

export const updateScenarios: PlaygroundScenario[] = [
  {
    "id": "update",
    "label": "Mettre à jour un champ",
    "method": "POST",
    "path": "/blog-posts/update",
    "request": "POST /blog-posts/update\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"data\": [\n    {\n      \"id\": \"cmsikpsjk000iwmvoo0omsygh\",\n      \"title\": \"Hello world (v2)\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsikpsjk000iwmvoo0omsygh\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsikpsjk000iwmvoo0omsygh\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsikprcg0000wmvo12u618yd\",\n        \"title\": \"Hello world (v2)\",\n        \"createdAt\": \"2026-08-07T06:38:22.400Z\",\n        \"updatedAt\": \"2026-08-07T06:38:22.430Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 7.79698,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.030946,
        "detail": {
          "userId": "cmsikprcg0000wmvo12u618yd"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.076422,
        "detail": {
          "policy": "canUpdateAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9307950000002165,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsikpsjk000iwmvoo0omsygh\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.521028999999544,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"title\" = $1, \"updatedAt\" = $2 WHERE (\"public\".\"BlogPost\".\"id\" = $3 AND \"public\".\"BlogPost\".\"tenantId\" = $4) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"Hello world (v2)\",\"2026-08-07T06:38:22.430Z\",\"cmsikpsjk000iwmvoo0omsygh\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 5.729326999997284,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.028267000001506,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.1899549999980081,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsikpskr000kwmvo1bapuz7z\",\"default\",\"BlogPost\",\"update\",\"cmsikpsjk000iwmvoo0omsygh\",\"{\\\"id\\\":\\\"cmsikpsjk000iwmvoo0omsygh\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsikprcg0000wmvo12u618yd\\\",\\\"title\\\":\\\"Hello world (v2)\\\",\\\"createdAt\\\":\\\"2026-08-07T06:38:22.400Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T06:38:22.430Z\\\",\\\"deletedAt\\\":null}\",\"cmsikprcg0000wmvo12u618yd\",null,\"c32b7e327f9d869ea75e041cf00c0f9cdd10a38d79762ae1d8aa167ef18da339\",\"8b56ac36d3a6620d138c1be74657d4f50d0427d0ec81ae613e1b86129fafb6c9\",\"2026-08-07T06:38:22.443Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.888731999999436,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.update",
        "status": "ok",
        "durationMs": 22.450621
      }
    ]
  },
  {
    "id": "attach-tags",
    "label": "Attacher un tag",
    "method": "POST",
    "path": "/blog-posts/update",
    "request": "POST /blog-posts/update\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"data\": [\n    {\n      \"id\": \"cmsikpsl9000lwmvo0567w1t7\",\n      \"relations\": {\n        \"tags\": {\n          \"attach\": [\n            \"cmsikpsls000nwmvot5siccfl\"\n          ]\n        }\n      }\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsikpsl9000lwmvo0567w1t7\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsikpsl9000lwmvo0567w1t7\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsikprcg0000wmvo12u618yd\",\n        \"title\": \"Tagged article\",\n        \"createdAt\": \"2026-08-07T06:38:22.461Z\",\n        \"updatedAt\": \"2026-08-07T06:38:22.461Z\",\n        \"deletedAt\": null,\n        \"tags\": [\n          \"cmsikpsls000nwmvot5siccfl\"\n        ]\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 8.595536,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.026292,
        "detail": {
          "userId": "cmsikprcg0000wmvo12u618yd"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.016096,
        "detail": {
          "policy": "canUpdateAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.0193440000002738,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsikpsl9000lwmvo0567w1t7\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7507479999985662,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsikpsl9000lwmvo0567w1t7\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.5360250000012456,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7521919999999227,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9415110000009008,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsikpsms000owmvoc1bchvms\",\"default\",\"BlogPost\",\"update\",\"cmsikpsl9000lwmvo0567w1t7\",\"{\\\"id\\\":\\\"cmsikpsl9000lwmvo0567w1t7\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsikprcg0000wmvo12u618yd\\\",\\\"title\\\":\\\"Tagged article\\\",\\\"createdAt\\\":\\\"2026-08-07T06:38:22.461Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T06:38:22.461Z\\\",\\\"deletedAt\\\":null}\",\"cmsikprcg0000wmvo12u618yd\",null,\"661e06e5a4e69bd2239270a0c71498d0e342d99b2b89c1579c74c821d430e683\",\"66dc495b5f63bc30bf6889bbc21ac59d50169ec7f19c02178590d0d08dbc9610\",\"2026-08-07T06:38:22.516Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.7748430000028748,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.724711999999272,
        "detail": {
          "sql": "INSERT INTO \"public\".\"BlogPostTag\" (\"blogPostId\",\"tagId\",\"createdAt\") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
          "params": "[\"cmsikpsl9000lwmvo0567w1t7\",\"cmsikpsls000nwmvot5siccfl\",\"2026-08-07T06:38:22.525Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.071615999997448,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.0057600000000093,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPostTag\".\"blogPostId\", \"public\".\"BlogPostTag\".\"tagId\" FROM \"public\".\"BlogPostTag\" WHERE \"public\".\"BlogPostTag\".\"blogPostId\" = $1 OFFSET $2",
          "params": "[\"cmsikpsl9000lwmvo0567w1t7\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.update",
        "status": "ok",
        "durationMs": 25.975366
      }
    ]
  }
];

export const deleteScenarios: PlaygroundScenario[] = [
  {
    "id": "soft",
    "label": "Suppression douce",
    "method": "POST",
    "path": "/blog-posts/delete",
    "request": "POST /blog-posts/delete\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmsikpsnl000pwmvoxlrtsb7s\"\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsikpsnl000pwmvoxlrtsb7s\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsikpsnl000pwmvoxlrtsb7s\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsikprcg0000wmvo12u618yd\",\n        \"title\": \"Hello world\",\n        \"createdAt\": \"2026-08-07T06:38:22.545Z\",\n        \"updatedAt\": \"2026-08-07T06:38:22.573Z\",\n        \"deletedAt\": \"2026-08-07T06:38:22.572Z\"\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 7.784636,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.045199,
        "detail": {
          "userId": "cmsikprcg0000wmvo12u618yd"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.093558,
        "detail": {
          "policy": "canDeleteAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9523179999996501,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsikpsnl000pwmvoxlrtsb7s\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.3064180000001215,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"deletedAt\" = $1, \"updatedAt\" = $2 WHERE (\"public\".\"BlogPost\".\"id\" = $3 AND \"public\".\"BlogPost\".\"tenantId\" = $4) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"2026-08-07T06:38:22.572Z\",\"2026-08-07T06:38:22.573Z\",\"cmsikpsnl000pwmvoxlrtsb7s\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7414810000009311,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9391230000001087,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8510180000012042,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsikpsol000rwmvoujjio6fm\",\"default\",\"BlogPost\",\"update\",\"cmsikpsnl000pwmvoxlrtsb7s\",\"{\\\"id\\\":\\\"cmsikpsnl000pwmvoxlrtsb7s\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsikprcg0000wmvo12u618yd\\\",\\\"title\\\":\\\"Hello world\\\",\\\"createdAt\\\":\\\"2026-08-07T06:38:22.545Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T06:38:22.573Z\\\",\\\"deletedAt\\\":\\\"2026-08-07T06:38:22.572Z\\\"}\",\"cmsikprcg0000wmvo12u618yd\",null,\"c58a9667ff8abcc4ee62e496b550ceb7101439dcf79a08b1c1fa2f6fdc6d9584\",\"17f79724feb12e23f6818cd4a863dff62c5526af8c7e13d3067eea96b5bc0f9c\",\"2026-08-07T06:38:22.581Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.6634389999999257,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.remove",
        "status": "ok",
        "durationMs": 15.561712
      }
    ]
  },
  {
    "id": "hard",
    "label": "Suppression définitive",
    "method": "POST",
    "path": "/blog-posts/delete",
    "request": "POST /blog-posts/delete\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmsikpsp0000swmvo4u5fwdyi\"\n  ],\n  \"mode\": \"hard\"\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsikpsp0000swmvo4u5fwdyi\",\n      \"status\": \"ok\",\n      \"data\": null\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.784631,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.026271,
        "detail": {
          "userId": "cmsikps4x0004wmvo53g5xcy0"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.015032,
        "detail": {
          "policy": "canDeleteAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.235764000000927,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsikpsp0000swmvo4u5fwdyi\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.802546999999322,
        "detail": {
          "sql": "DELETE FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"cmsikpsp0000swmvo4u5fwdyi\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.5772390000020096,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9040970000023663,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7764839999981632,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsikpspy000uwmvocng9syup\",\"default\",\"BlogPost\",\"delete\",\"cmsikpsp0000swmvo4u5fwdyi\",\"{\\\"id\\\":\\\"cmsikpsp0000swmvo4u5fwdyi\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsikps4x0004wmvo53g5xcy0\\\",\\\"title\\\":\\\"Gone for good\\\",\\\"createdAt\\\":\\\"2026-08-07T06:38:22.596Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T06:38:22.596Z\\\",\\\"deletedAt\\\":null}\",\"cmsikps4x0004wmvo53g5xcy0\",null,\"231392c0f187c40f447e9791ae9b86259885fd4013f4470472febd4fa768edf1\",\"c620822daf6d45cab091eb275f944406ff2af8dfee4d708f44296963844292d2\",\"2026-08-07T06:38:22.630Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.447907000001578,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.remove",
        "status": "ok",
        "durationMs": 15.261732
      }
    ]
  }
];

export const restoreScenarios: PlaygroundScenario[] = [
  {
    "id": "restore",
    "label": "Restaurer",
    "method": "POST",
    "path": "/blog-posts/restore",
    "request": "POST /blog-posts/restore\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmsikpsqe000vwmvo6ibj150s\"\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsikpsqe000vwmvo6ibj150s\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsikpsqe000vwmvo6ibj150s\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsikprcg0000wmvo12u618yd\",\n        \"title\": \"Hello world\",\n        \"createdAt\": \"2026-08-07T06:38:22.646Z\",\n        \"updatedAt\": \"2026-08-07T06:38:22.697Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 8.892058,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.052011,
        "detail": {
          "userId": "cmsikprcg0000wmvo12u618yd"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.09996,
        "detail": {
          "policy": "canRestoreAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.0082519999996293,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsikpsqe000vwmvo6ibj150s\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 4.515341999998782,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"deletedAt\" = $1, \"updatedAt\" = $2 WHERE (\"public\".\"BlogPost\".\"id\" = $3 AND \"public\".\"BlogPost\".\"tenantId\" = $4) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[null,\"2026-08-07T06:38:22.697Z\",\"cmsikpsqe000vwmvo6ibj150s\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9917349999996077,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8759140000001935,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.0393870000007155,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsikpss2000ywmvodfxwawqj\",\"default\",\"BlogPost\",\"update\",\"cmsikpsqe000vwmvo6ibj150s\",\"{\\\"id\\\":\\\"cmsikpsqe000vwmvo6ibj150s\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsikprcg0000wmvo12u618yd\\\",\\\"title\\\":\\\"Hello world\\\",\\\"createdAt\\\":\\\"2026-08-07T06:38:22.646Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T06:38:22.697Z\\\",\\\"deletedAt\\\":null}\",\"cmsikprcg0000wmvo12u618yd\",null,\"929105f92ec895afad69f2cdd5540814c1d399535378e3f430c2ae9869ee603b\",\"1cf84c37e27b47d16cca968b74a8d90eefa1770ef0d60ba8e0b3e530d36abaae\",\"2026-08-07T06:38:22.707Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.1859000000004016,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.restore",
        "status": "ok",
        "durationMs": 18.911479
      }
    ]
  },
  {
    "id": "restore-with-patch",
    "label": "Restaurer avec un correctif",
    "method": "POST",
    "path": "/blog-posts/restore",
    "request": "POST /blog-posts/restore\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmsikpssn000zwmvok8em57vq\"\n  ],\n  \"patch\": {\n    \"title\": \"Hello world (restored)\"\n  }\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsikpssn000zwmvok8em57vq\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsikpssn000zwmvok8em57vq\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsikprcg0000wmvo12u618yd\",\n        \"title\": \"Hello world (restored)\",\n        \"createdAt\": \"2026-08-07T06:38:22.728Z\",\n        \"updatedAt\": \"2026-08-07T06:38:22.775Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.370548,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.023514,
        "detail": {
          "userId": "cmsikprcg0000wmvo12u618yd"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.014712,
        "detail": {
          "policy": "canRestoreAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.714639999998326,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsikpssn000zwmvok8em57vq\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.8711479999983567,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"title\" = $1, \"deletedAt\" = $2, \"updatedAt\" = $3 WHERE (\"public\".\"BlogPost\".\"id\" = $4 AND \"public\".\"BlogPost\".\"tenantId\" = $5) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"Hello world (restored)\",null,\"2026-08-07T06:38:22.775Z\",\"cmsikpssn000zwmvok8em57vq\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7897899999989022,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9615349999985483,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.1596539999991364,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsikpsu80012wmvohrbdz6xz\",\"default\",\"BlogPost\",\"update\",\"cmsikpssn000zwmvok8em57vq\",\"{\\\"id\\\":\\\"cmsikpssn000zwmvok8em57vq\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsikprcg0000wmvo12u618yd\\\",\\\"title\\\":\\\"Hello world (restored)\\\",\\\"createdAt\\\":\\\"2026-08-07T06:38:22.728Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T06:38:22.775Z\\\",\\\"deletedAt\\\":null}\",\"cmsikprcg0000wmvo12u618yd\",null,\"c9585b1ffeda0ec6f1225af64f7e8fb405df940fa7ce39395d49fa7eafee93d2\",\"5c3add5440c3adf4bf8526456f8e2e72a41b19b47c5857a4378acdac0b270da3\",\"2026-08-07T06:38:22.784Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 4.216121999997995,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.restore",
        "status": "ok",
        "durationMs": 17.702038
      }
    ]
  }
];

export const detailsScenarios: PlaygroundScenario[] = [
  {
    "id": "read-one",
    "label": "Lire un enregistrement",
    "method": "POST",
    "path": "/blog-posts/search",
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"filters\": [\n    {\n      \"field\": \"id\",\n      \"value\": \"cmsikpsus0013wmvojl6kn93e\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"id\": \"cmsikpsus0013wmvojl6kn93e\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmsikprcg0000wmvo12u618yd\",\n      \"title\": \"Hello world\",\n      \"createdAt\": \"2026-08-07T06:38:22.804Z\",\n      \"updatedAt\": \"2026-08-07T06:38:22.804Z\",\n      \"deletedAt\": null\n    }\n  ],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 15,\n    \"last_page\": 1,\n    \"total\": 1\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 8.706924,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.0216,
        "detail": {
          "userId": "cmsikprcg0000wmvo12u618yd"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.016883,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.111707000000024,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) OFFSET $4) AS \"sub\"",
          "params": "[\"cmsikprcg0000wmvo12u618yd\",\"cmsikpsus0013wmvojl6kn93e\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.522501999999804,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $4 OFFSET $5",
          "params": "[\"cmsikprcg0000wmvo12u618yd\",\"cmsikpsus0013wmvojl6kn93e\",\"default\",\"15\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 2.399718
      }
    ]
  },
  {
    "id": "describe",
    "label": "Contrat de la ressource",
    "method": "GET",
    "path": "/blog-posts/describe",
    "request": "GET /blog-posts/describe\nAuthorization: Bearer <token>",
    "response": "{\n  \"data\": {\n    \"fields\": [\n      {\n        \"name\": \"title\",\n        \"type\": \"string\",\n        \"optional\": false\n      }\n    ],\n    \"sorts\": [\n      \"createdAt\"\n    ],\n    \"filters\": [\n      \"id\",\n      \"title\"\n    ],\n    \"selects\": [\n      \"id\",\n      \"ownerId\",\n      \"title\",\n      \"createdAt\",\n      \"updatedAt\",\n      \"deletedAt\"\n    ],\n    \"includes\": {\n      \"notes\": {\n        \"type\": \"hasMany\",\n        \"foreignKey\": \"blogPostId\",\n        \"childDelegate\": \"blogPostNote\",\n        \"filters\": [\n          \"body\"\n        ],\n        \"sorts\": [\n          \"createdAt\"\n        ],\n        \"selects\": [\n          \"id\",\n          \"body\",\n          \"rating\",\n          \"createdAt\"\n        ]\n      },\n      \"comments\": {\n        \"type\": \"morphMany\",\n        \"foreignKey\": \"commentableId\",\n        \"discriminator\": \"commentableType\",\n        \"discriminatorValue\": \"BlogPost\",\n        \"childDelegate\": \"comment\",\n        \"filters\": [\n          \"body\"\n        ],\n        \"sorts\": [\n          \"createdAt\"\n        ],\n        \"selects\": [\n          \"id\",\n          \"body\",\n          \"createdAt\"\n        ]\n      }\n    },\n    \"aggregates\": {\n      \"notes\": {\n        \"type\": \"hasMany\",\n        \"foreignKey\": \"blogPostId\",\n        \"childDelegate\": \"blogPostNote\",\n        \"filters\": [\n          \"body\"\n        ],\n        \"fields\": [\n          \"rating\"\n        ]\n      },\n      \"comments\": {\n        \"type\": \"morphMany\",\n        \"foreignKey\": \"commentableId\",\n        \"discriminator\": \"commentableType\",\n        \"discriminatorValue\": \"BlogPost\",\n        \"childDelegate\": \"comment\",\n        \"filters\": [\n          \"body\"\n        ],\n        \"fields\": []\n      }\n    },\n    \"limits\": [\n      10,\n      15,\n      20\n    ],\n    \"defaultLimit\": 15,\n    \"paginated\": true,\n    \"rules\": {\n      \"create\": {\n        \"$schema\": \"https://json-schema.org/draft/2020-12/schema\",\n        \"type\": \"object\",\n        \"properties\": {\n          \"title\": {\n            \"type\": \"string\",\n            \"minLength\": 1,\n            \"maxLength\": 255\n          }\n        },\n        \"required\": [\n          \"title\"\n        ],\n        \"additionalProperties\": false\n      },\n      \"update\": {\n        \"$schema\": \"https://json-schema.org/draft/2020-12/schema\",\n        \"type\": \"object\",\n        \"properties\": {\n          \"title\": {\n            \"type\": \"string\",\n            \"minLength\": 1,\n            \"maxLength\": 255\n          }\n        },\n        \"additionalProperties\": false\n      }\n    }\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 7.584051,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.043132,
        "detail": {
          "userId": "cmsikprcg0000wmvo12u618yd"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.01757,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.describe",
        "status": "ok",
        "durationMs": 0.110163
      }
    ]
  }
];

export const resourceCode = {
  "search": "@Post('search')\n  @HttpCode(200)\n  @Capability(canViewAnyBlogPost)\n  async search(\n    @Req() req: RequestWithUser,\n    @Body(new ZodValidationPipe(searchRequestSchema)) body: SearchRequestBody,\n  ) {\n    const query = parseSearchRequest(body, BLOG_POST_CONTRACT);\n    const subject = subjectOf(req.user);\n\n    if (query.withTrashed || query.onlyTrashed) {\n      const trashedDecision = canListTrashedBlogPost(subject);\n\n      if (!trashedDecision.allowed) {\n        throw new CapabilityForbiddenException(trashedDecision);\n      }\n    }\n\n    const { records, total, matches } = await this.blogPosts.search(\n      subject,\n      query,\n    );\n    const capabilities = body.capabilities ?? [];\n    const select = query.select;\n    const project = (view: Record<string, unknown>) =>\n      select\n        ? Object.fromEntries(\n            Object.entries(view).filter(([key]) => key in select),\n          )\n        : view;\n    const pageLimit = query.limit ?? 15;\n    const meta = {\n      channels: [BLOG_POST_SIGNAL_CHANNEL],\n      page: query.page ?? 1,\n      limit: pageLimit,\n      last_page: Math.max(1, Math.ceil(total / pageLimit)),\n      total,\n      ...(matches\n        ? {\n            search: { matchLimit: matches.limit, truncated: matches.truncated },\n          }\n        : {}),\n    };\n\n    // A truncated match set makes total a floor rather than a count, so the\n    // response says which one it is instead of leaving the caller to trust a\n    // number that is quietly wrong.\n    const messages = matches?.truncated\n      ? [\n          `Only the first ${matches.limit} full-text matches were counted, and more exist. The totals below are a floor, not a count -- narrow the search term to see the rest.`,\n        ]\n      : [];\n\n    if (capabilities.length === 0) {\n      return ok(\n        records.map((record) =>\n          withIncludesAndAggregates(\n            project(toBlogPostView(record)),\n            record,\n            query,\n          ),\n        ),\n        meta,\n        messages,\n      );\n    }\n\n    return ok(\n      records.map((record) => {\n        const resolved = this.policy.recordCapabilities(subject, record);\n        return {\n          ...withIncludesAndAggregates(\n            project(toBlogPostView(record)),\n            record,\n            query,\n          ),\n          capabilities: Object.fromEntries(\n            Object.entries(resolved).filter(([key]) =>\n              capabilities.includes(key),\n            ),\n          ),\n        };\n      }),\n      {\n        ...meta,\n        capabilities: this.policy.metaCapabilities(subject),\n      },\n      messages,\n    );\n  }",
  "create": "@Post('create')\n  @Capability(canCreateBlogPost)\n  async create(\n    @Req() req: RequestWithUser,\n    @Body(new ZodValidationPipe(createBlogPostRequestSchema))\n    body: CreateBlogPostRequestBody,\n  ) {\n    const subject = subjectOf(req.user);\n    const results = [];\n\n    for (const [index, item] of body.data.entries()) {\n      try {\n        const created = await this.blogPosts.create(subject, item);\n        results.push({\n          index,\n          status: 'ok' as const,\n          data: toBlogPostView(created),\n        });\n      } catch (error) {\n        results.push({\n          index,\n          status: 'error' as const,\n          error: resolveDomainError(error),\n        });\n      }\n    }\n\n    return ok(results);\n  }",
  "update": "@Post('update')\n  @Capability(canUpdateAnyBlogPost)\n  async update(\n    @Req() req: RequestWithUser,\n    @Body(new ZodValidationPipe(updateBlogPostRequestSchema))\n    body: UpdateBlogPostRequestBody,\n  ) {\n    const subject = subjectOf(req.user);\n    const loaded = await this.loadAndAuthorize(\n      body.data.map((item) => item.id),\n      subject,\n      (s, record) => canUpdateBlogPost(s, record as never),\n    );\n\n    const results = [];\n\n    for (const [index, entry] of loaded.entries()) {\n      if (!entry.ok) {\n        results.push({\n          index,\n          id: entry.id,\n          status: 'error' as const,\n          error: entry.error,\n        });\n        continue;\n      }\n\n      const { id: _id, relations, ...data } = body.data[index]!;\n\n      try {\n        const updated = await this.blogPosts.update(entry.record, data);\n        const relationResults: Record<string, string[]> = {};\n\n        if (relations?.tags) {\n          const { attach, detach, sync } = relations.tags;\n\n          if ((attach && attach.length > 0) || sync) {\n            const decision = canAttachTagsToBlogPost(subject, entry.record);\n            if (!decision.allowed) {\n              throw new CapabilityForbiddenException(decision);\n            }\n          }\n\n          if ((detach && detach.length > 0) || sync) {\n            const decision = canDetachTagsFromBlogPost(subject, entry.record);\n            if (!decision.allowed) {\n              throw new CapabilityForbiddenException(decision);\n            }\n          }\n\n          relationResults.tags = await this.blogPosts.syncTags(\n            entry.record,\n            relations.tags,\n          );\n        }\n\n        results.push({\n          index,\n          id: entry.id,\n          status: 'ok' as const,\n          data: { ...toBlogPostView(updated), ...relationResults },\n        });\n      } catch (error) {\n        results.push({\n          index,\n          id: entry.id,\n          status: 'error' as const,\n          error: resolveDomainError(error),\n        });\n      }\n    }\n\n    return ok(results);\n  }",
  "delete": "@Post('delete')\n  @Capability(canDeleteAnyBlogPost)\n  async remove(\n    @Req() req: RequestWithUser,\n    @Body(new ZodValidationPipe(deleteBlogPostRequestSchema))\n    body: DeleteBlogPostRequestBody,\n  ) {\n    const subject = subjectOf(req.user);\n    const loaded = await this.loadAndAuthorize(body.ids, subject, (s, record) =>\n      canDeleteBlogPost(s, record as never),\n    );\n\n    if (body.mode === 'hard') {\n      const hardDecision = canHardDeleteBlogPost(subject);\n\n      if (!hardDecision.allowed) {\n        throw new CapabilityForbiddenException(hardDecision);\n      }\n    }\n\n    const results = [];\n\n    for (const [index, entry] of loaded.entries()) {\n      if (!entry.ok) {\n        results.push({\n          index,\n          id: entry.id,\n          status: 'error' as const,\n          error: entry.error,\n        });\n        continue;\n      }\n\n      try {\n        if (body.mode === 'hard') {\n          await this.blogPosts.hardDelete(entry.record);\n          results.push({\n            index,\n            id: entry.id,\n            status: 'ok' as const,\n            data: null,\n          });\n        } else {\n          const removed = await this.blogPosts.softDelete(entry.record);\n          results.push({\n            index,\n            id: entry.id,\n            status: 'ok' as const,\n            data: toBlogPostView(removed),\n          });\n        }\n      } catch (error) {\n        results.push({\n          index,\n          id: entry.id,\n          status: 'error' as const,\n          error: resolveDomainError(error),\n        });\n      }\n    }\n\n    return ok(results);\n  }",
  "restore": "@Post('restore')\n  @Capability(canRestoreAnyBlogPost)\n  async restore(\n    @Req() req: RequestWithUser,\n    @Body(new ZodValidationPipe(restoreBlogPostRequestSchema))\n    body: RestoreBlogPostRequestBody,\n  ) {\n    const subject = subjectOf(req.user);\n    const loaded = await this.loadAndAuthorize(body.ids, subject, (s, record) =>\n      canRestoreBlogPost(s, record as never),\n    );\n\n    const results = [];\n\n    for (const [index, entry] of loaded.entries()) {\n      if (!entry.ok) {\n        results.push({\n          index,\n          id: entry.id,\n          status: 'error' as const,\n          error: entry.error,\n        });\n        continue;\n      }\n\n      try {\n        if (!entry.record.deletedAt) {\n          throw new AlreadyRestoredException('blog-post');\n        }\n\n        const restored = await this.blogPosts.restore(entry.record, body.patch);\n        results.push({\n          index,\n          id: entry.id,\n          status: 'ok' as const,\n          data: toBlogPostView(restored),\n        });\n      } catch (error) {\n        results.push({\n          index,\n          id: entry.id,\n          status: 'error' as const,\n          error: resolveDomainError(error),\n        });\n      }\n    }\n\n    return ok(results);\n  }",
  "describe": "@Get('describe')\n  @Capability(canViewAnyBlogPost)\n  describe() {\n    return ok(BLOG_POST_DESCRIBE);\n  }"
};
