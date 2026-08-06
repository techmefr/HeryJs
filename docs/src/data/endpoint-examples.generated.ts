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
        "durationMs": 23.652757,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.076946,
        "detail": {
          "userId": "cmshndgal0000h1voirkhcpru"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.125058,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 6.81555600000047,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"title\"::text LIKE ('%' || $2 || '%') AND \"public\".\"BlogPost\".\"tenantId\" = $3) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $4 OFFSET $5",
          "params": "[\"cmshndgal0000h1voirkhcpru\",\"hello\",\"default\",\"15\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 16.334799999999632,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"title\"::text LIKE ('%' || $2 || '%') AND \"public\".\"BlogPost\".\"tenantId\" = $3) OFFSET $4) AS \"sub\"",
          "params": "[\"cmshndgal0000h1voirkhcpru\",\"hello\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 28.388189
      }
    ]
  },
  {
    "id": "sort-paginate",
    "label": "Trier et paginer",
    "method": "POST",
    "path": "/blog-posts/search",
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"sorts\": [\n    {\n      \"field\": \"createdAt\",\n      \"direction\": \"desc\"\n    }\n  ],\n  \"page\": 1,\n  \"limit\": 10\n}",
    "response": "{\n  \"data\": [\n    {\n      \"id\": \"cmshndgwe000ch1voue42mj0d\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmshndgal0000h1voirkhcpru\",\n      \"title\": \"Changelog\",\n      \"createdAt\": \"2026-08-06T15:05:00.110Z\",\n      \"updatedAt\": \"2026-08-06T15:05:00.110Z\",\n      \"deletedAt\": null\n    },\n    {\n      \"id\": \"cmshndgvb000ah1voufgnj48l\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmshndgal0000h1voirkhcpru\",\n      \"title\": \"Release notes\",\n      \"createdAt\": \"2026-08-06T15:05:00.071Z\",\n      \"updatedAt\": \"2026-08-06T15:05:00.071Z\",\n      \"deletedAt\": null\n    },\n    {\n      \"id\": \"cmshndgs30008h1vonl78o0dq\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmshndgal0000h1voirkhcpru\",\n      \"title\": \"Hello world\",\n      \"createdAt\": \"2026-08-06T15:04:59.955Z\",\n      \"updatedAt\": \"2026-08-06T15:04:59.955Z\",\n      \"deletedAt\": null\n    }\n  ],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 10,\n    \"last_page\": 1,\n    \"total\": 3\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 7.590169,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.063426,
        "detail": {
          "userId": "cmshndgal0000h1voirkhcpru"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.021175,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.3455559999993056,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"tenantId\" = $2) OFFSET $3) AS \"sub\"",
          "params": "[\"cmshndgal0000h1voirkhcpru\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.5517720000007102,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"tenantId\" = $2) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $3 OFFSET $4",
          "params": "[\"cmshndgal0000h1voirkhcpru\",\"default\",\"10\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 5.50115
      }
    ]
  },
  {
    "id": "by-id",
    "label": "Chercher par identifiant",
    "method": "POST",
    "path": "/blog-posts/search",
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"filters\": [\n    {\n      \"field\": \"id\",\n      \"value\": \"cmshndgxq000eh1vo2xhadkui\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"id\": \"cmshndgxq000eh1vo2xhadkui\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmshndgal0000h1voirkhcpru\",\n      \"title\": \"Fetched by id\",\n      \"createdAt\": \"2026-08-06T15:05:00.158Z\",\n      \"updatedAt\": \"2026-08-06T15:05:00.158Z\",\n      \"deletedAt\": null\n    }\n  ],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 15,\n    \"last_page\": 1,\n    \"total\": 1\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 7.925662,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.032701,
        "detail": {
          "userId": "cmshndgal0000h1voirkhcpru"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.01988,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.9807799999998679,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $4 OFFSET $5",
          "params": "[\"cmshndgal0000h1voirkhcpru\",\"cmshndgxq000eh1vo2xhadkui\",\"default\",\"15\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.4308410000003278,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) OFFSET $4) AS \"sub\"",
          "params": "[\"cmshndgal0000h1voirkhcpru\",\"cmshndgxq000eh1vo2xhadkui\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 4.844205
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
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmshndgz7000gh1von5hk140a\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmshndgal0000h1voirkhcpru\",\n        \"title\": \"Hello world\",\n        \"createdAt\": \"2026-08-06T15:05:00.211Z\",\n        \"updatedAt\": \"2026-08-06T15:05:00.211Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.402516,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.033341,
        "detail": {
          "userId": "cmshndgal0000h1voirkhcpru"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.018825,
        "detail": {
          "policy": "canCreateBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.306144000000131,
        "detail": {
          "sql": "INSERT INTO \"public\".\"BlogPost\" (\"id\",\"tenantId\",\"ownerId\",\"title\",\"createdAt\",\"updatedAt\") VALUES ($1,$2,$3,$4,$5,$6) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"cmshndgz7000gh1von5hk140a\",\"default\",\"cmshndgal0000h1voirkhcpru\",\"Hello world\",\"2026-08-06T15:05:00.211Z\",\"2026-08-06T15:05:00.211Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.6725599999999758,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.0188410000000658,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.2400180000004184,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmshndgzg000hh1vo8siqdki0\",\"default\",\"BlogPost\",\"create\",\"cmshndgz7000gh1von5hk140a\",\"{\\\"id\\\":\\\"cmshndgz7000gh1von5hk140a\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmshndgal0000h1voirkhcpru\\\",\\\"title\\\":\\\"Hello world\\\",\\\"createdAt\\\":\\\"2026-08-06T15:05:00.211Z\\\",\\\"updatedAt\\\":\\\"2026-08-06T15:05:00.211Z\\\",\\\"deletedAt\\\":null}\",\"cmshndgal0000h1voirkhcpru\",null,\"aba4b42b14a665597ff8d6062e68bd8564cdd4adf318e29906d11fcd6e36309a\",\"07e0a5909af409b145400b12ab241f58b842836c5ab3636b82c0315f4dce2a92\",\"2026-08-06T15:05:00.220Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.7541959999998653,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.create",
        "status": "ok",
        "durationMs": 14.175237
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
        "durationMs": 7.192655,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.032782,
        "detail": {
          "userId": "cmshndgal0000h1voirkhcpru"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.022183,
        "detail": {
          "policy": "canCreateBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.create",
        "status": "error",
        "durationMs": 1.190149,
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
    "request": "POST /blog-posts/update\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"data\": [\n    {\n      \"id\": \"cmshndh08000ih1vo51eik73d\",\n      \"title\": \"Hello world (v2)\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmshndh08000ih1vo51eik73d\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmshndh08000ih1vo51eik73d\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmshndgal0000h1voirkhcpru\",\n        \"title\": \"Hello world (v2)\",\n        \"createdAt\": \"2026-08-06T15:05:00.248Z\",\n        \"updatedAt\": \"2026-08-06T15:05:00.273Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.620262,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.028793,
        "detail": {
          "userId": "cmshndgal0000h1voirkhcpru"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.071247,
        "detail": {
          "policy": "canUpdateAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.908078999999816,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmshndh08000ih1vo51eik73d\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.6456459999999424,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"title\" = $1, \"updatedAt\" = $2 WHERE (\"public\".\"BlogPost\".\"id\" = $3 AND \"public\".\"BlogPost\".\"tenantId\" = $4) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"Hello world (v2)\",\"2026-08-06T15:05:00.273Z\",\"cmshndh08000ih1vo51eik73d\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.5044349999998303,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.5850389999995969,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.133136999999806,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmshndh12000kh1vovcv5qud9\",\"default\",\"BlogPost\",\"update\",\"cmshndh08000ih1vo51eik73d\",\"{\\\"id\\\":\\\"cmshndh08000ih1vo51eik73d\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmshndgal0000h1voirkhcpru\\\",\\\"title\\\":\\\"Hello world (v2)\\\",\\\"createdAt\\\":\\\"2026-08-06T15:05:00.248Z\\\",\\\"updatedAt\\\":\\\"2026-08-06T15:05:00.273Z\\\",\\\"deletedAt\\\":null}\",\"cmshndgal0000h1voirkhcpru\",null,\"37efd8febe7058fd382835fec6a878b5bc31df8888eda1f4a7e2f73393ae9964\",\"ad90e6f8db11e4ef56cfec7c164db32e635e83709d7612b0e6552f3a825db62e\",\"2026-08-06T15:05:00.278Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.46401700000024,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.update",
        "status": "ok",
        "durationMs": 13.851986
      }
    ]
  },
  {
    "id": "attach-tags",
    "label": "Attacher un tag",
    "method": "POST",
    "path": "/blog-posts/update",
    "request": "POST /blog-posts/update\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"data\": [\n    {\n      \"id\": \"cmshndh1g000lh1vod6wkrwgz\",\n      \"relations\": {\n        \"tags\": {\n          \"attach\": [\n            \"cmshndh1u000nh1vo36l681kh\"\n          ]\n        }\n      }\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmshndh1g000lh1vod6wkrwgz\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmshndh1g000lh1vod6wkrwgz\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmshndgal0000h1voirkhcpru\",\n        \"title\": \"Tagged article\",\n        \"createdAt\": \"2026-08-06T15:05:00.292Z\",\n        \"updatedAt\": \"2026-08-06T15:05:00.292Z\",\n        \"deletedAt\": null,\n        \"tags\": [\n          \"cmshndh1u000nh1vo36l681kh\"\n        ]\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 11.652413,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.060134,
        "detail": {
          "userId": "cmshndgal0000h1voirkhcpru"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.027179,
        "detail": {
          "policy": "canUpdateAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8332059999993362,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmshndh1g000lh1vod6wkrwgz\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9245470000005298,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmshndh1g000lh1vod6wkrwgz\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.5618560000002617,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.6976639999993495,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7683680000000095,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmshndh2r000oh1vovhx3ygf8\",\"default\",\"BlogPost\",\"update\",\"cmshndh1g000lh1vod6wkrwgz\",\"{\\\"id\\\":\\\"cmshndh1g000lh1vod6wkrwgz\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmshndgal0000h1voirkhcpru\\\",\\\"title\\\":\\\"Tagged article\\\",\\\"createdAt\\\":\\\"2026-08-06T15:05:00.292Z\\\",\\\"updatedAt\\\":\\\"2026-08-06T15:05:00.292Z\\\",\\\"deletedAt\\\":null}\",\"cmshndgal0000h1voirkhcpru\",null,\"5f45b3bb1ff53d725e0689283ebb20fef5a2edbe189ad0f69a81e153ab9aff3e\",\"45f05aeee72892d5abcbb76d3a2e99a336e0f5de42980d6c1f530252f1b3e063\",\"2026-08-06T15:05:00.339Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.2746460000007573,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.5161010000001625,
        "detail": {
          "sql": "INSERT INTO \"public\".\"BlogPostTag\" (\"blogPostId\",\"tagId\",\"createdAt\") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
          "params": "[\"cmshndh1g000lh1vod6wkrwgz\",\"cmshndh1u000nh1vo36l681kh\",\"2026-08-06T15:05:00.346Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.253066000000217,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8999809999995705,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPostTag\".\"blogPostId\", \"public\".\"BlogPostTag\".\"tagId\" FROM \"public\".\"BlogPostTag\" WHERE \"public\".\"BlogPostTag\".\"blogPostId\" = $1 OFFSET $2",
          "params": "[\"cmshndh1g000lh1vod6wkrwgz\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.update",
        "status": "ok",
        "durationMs": 22.21302
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
    "request": "POST /blog-posts/delete\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmshndh3e000ph1vo0im3szoi\"\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmshndh3e000ph1vo0im3szoi\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmshndh3e000ph1vo0im3szoi\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmshndgal0000h1voirkhcpru\",\n        \"title\": \"Hello world\",\n        \"createdAt\": \"2026-08-06T15:05:00.362Z\",\n        \"updatedAt\": \"2026-08-06T15:05:00.384Z\",\n        \"deletedAt\": \"2026-08-06T15:05:00.383Z\"\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.268228,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.0268,
        "detail": {
          "userId": "cmshndgal0000h1voirkhcpru"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.06847,
        "detail": {
          "policy": "canDeleteAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.6680010000000038,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmshndh3e000ph1vo0im3szoi\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.9518010000001595,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"deletedAt\" = $1, \"updatedAt\" = $2 WHERE (\"public\".\"BlogPost\".\"id\" = $3 AND \"public\".\"BlogPost\".\"tenantId\" = $4) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"2026-08-06T15:05:00.383Z\",\"2026-08-06T15:05:00.384Z\",\"cmshndh3e000ph1vo0im3szoi\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.5665030000000115,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8048380000000179,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9253680000001623,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmshndh48000rh1von1mpjiz7\",\"default\",\"BlogPost\",\"update\",\"cmshndh3e000ph1vo0im3szoi\",\"{\\\"id\\\":\\\"cmshndh3e000ph1vo0im3szoi\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmshndgal0000h1voirkhcpru\\\",\\\"title\\\":\\\"Hello world\\\",\\\"createdAt\\\":\\\"2026-08-06T15:05:00.362Z\\\",\\\"updatedAt\\\":\\\"2026-08-06T15:05:00.384Z\\\",\\\"deletedAt\\\":\\\"2026-08-06T15:05:00.383Z\\\"}\",\"cmshndgal0000h1voirkhcpru\",null,\"cf0a7104fdb4aaf752ac734491f1c4ba147c5a2aae392c5900e68541a2bc80fe\",\"7e5d4a07cfe847fab44d2d643bb69646e8787601595cc7f3cdeaa3784bbc2f8c\",\"2026-08-06T15:05:00.392Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.5610969999997906,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.remove",
        "status": "ok",
        "durationMs": 14.631511
      }
    ]
  },
  {
    "id": "hard",
    "label": "Suppression définitive",
    "method": "POST",
    "path": "/blog-posts/delete",
    "request": "POST /blog-posts/delete\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmshndh4m000sh1vo6d0dmfuv\"\n  ],\n  \"mode\": \"hard\"\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmshndh4m000sh1vo6d0dmfuv\",\n      \"status\": \"ok\",\n      \"data\": null\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 7.123486,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.029383,
        "detail": {
          "userId": "cmshndglb0004h1voxkva3o40"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.020141,
        "detail": {
          "policy": "canDeleteAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.6812780000000203,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmshndh4m000sh1vo6d0dmfuv\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.65142300000025,
        "detail": {
          "sql": "DELETE FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"cmshndh4m000sh1vo6d0dmfuv\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.6614479999998366,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8726029999997991,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9159740000004604,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmshndh5i000uh1vorshqrt96\",\"default\",\"BlogPost\",\"delete\",\"cmshndh4m000sh1vo6d0dmfuv\",\"{\\\"id\\\":\\\"cmshndh4m000sh1vo6d0dmfuv\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmshndglb0004h1voxkva3o40\\\",\\\"title\\\":\\\"Gone for good\\\",\\\"createdAt\\\":\\\"2026-08-06T15:05:00.406Z\\\",\\\"updatedAt\\\":\\\"2026-08-06T15:05:00.406Z\\\",\\\"deletedAt\\\":null}\",\"cmshndglb0004h1voxkva3o40\",null,\"4fc7a599d68a7222247d57b94656f408b0bbf8ae86d5206f8a974fbdf5a9467d\",\"b48ce70f45309e5492038bfaa5cff396baf4e5563aa525f471f8fc3b616c69cd\",\"2026-08-06T15:05:00.438Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.590479000000414,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.remove",
        "status": "ok",
        "durationMs": 14.445709
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
    "request": "POST /blog-posts/restore\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmshndh61000vh1voew1wwcql\"\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmshndh61000vh1voew1wwcql\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmshndh61000vh1voew1wwcql\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmshndgal0000h1voirkhcpru\",\n        \"title\": \"Hello world\",\n        \"createdAt\": \"2026-08-06T15:05:00.457Z\",\n        \"updatedAt\": \"2026-08-06T15:05:00.555Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.565017,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.024456,
        "detail": {
          "userId": "cmshndgal0000h1voirkhcpru"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.072524,
        "detail": {
          "policy": "canRestoreAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.843246999999792,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmshndh61000vh1voew1wwcql\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 4.398631000000023,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"deletedAt\" = $1, \"updatedAt\" = $2 WHERE (\"public\".\"BlogPost\".\"id\" = $3 AND \"public\".\"BlogPost\".\"tenantId\" = $4) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[null,\"2026-08-06T15:05:00.555Z\",\"cmshndh61000vh1voew1wwcql\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.48737400000027264,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9168959999997242,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8420450000003257,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmshndh8z000yh1vo8dpg880v\",\"default\",\"BlogPost\",\"update\",\"cmshndh61000vh1voew1wwcql\",\"{\\\"id\\\":\\\"cmshndh61000vh1voew1wwcql\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmshndgal0000h1voirkhcpru\\\",\\\"title\\\":\\\"Hello world\\\",\\\"createdAt\\\":\\\"2026-08-06T15:05:00.457Z\\\",\\\"updatedAt\\\":\\\"2026-08-06T15:05:00.555Z\\\",\\\"deletedAt\\\":null}\",\"cmshndgal0000h1voirkhcpru\",null,\"44484e7a955ea4f842571ae67ebab72a8fcf9b307be91c0d100e1808a6d57fe7\",\"6e72af84e03a8707ad34ac0122bd907492755a896e5ec30115a04b56e7be7f50\",\"2026-08-06T15:05:00.563Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.2402860000001965,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.restore",
        "status": "ok",
        "durationMs": 14.52808
      }
    ]
  },
  {
    "id": "restore-with-patch",
    "label": "Restaurer avec un correctif",
    "method": "POST",
    "path": "/blog-posts/restore",
    "request": "POST /blog-posts/restore\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmshndh9c000zh1vob89kufh3\"\n  ],\n  \"patch\": {\n    \"title\": \"Hello world (restored)\"\n  }\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmshndh9c000zh1vob89kufh3\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmshndh9c000zh1vob89kufh3\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmshndgal0000h1voirkhcpru\",\n        \"title\": \"Hello world (restored)\",\n        \"createdAt\": \"2026-08-06T15:05:00.576Z\",\n        \"updatedAt\": \"2026-08-06T15:05:00.623Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.60492,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.025023,
        "detail": {
          "userId": "cmshndgal0000h1voirkhcpru"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.014725,
        "detail": {
          "policy": "canRestoreAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8624769999996715,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmshndh9c000zh1vob89kufh3\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.7640199999996184,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"title\" = $1, \"deletedAt\" = $2, \"updatedAt\" = $3 WHERE (\"public\".\"BlogPost\".\"id\" = $4 AND \"public\".\"BlogPost\".\"tenantId\" = $5) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"Hello world (restored)\",null,\"2026-08-06T15:05:00.623Z\",\"cmshndh9c000zh1vob89kufh3\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8749760000000606,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.2687999999998283,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.1544519999997647,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmshndhaw0012h1vol10kk8uv\",\"default\",\"BlogPost\",\"update\",\"cmshndh9c000zh1vob89kufh3\",\"{\\\"id\\\":\\\"cmshndh9c000zh1vob89kufh3\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmshndgal0000h1voirkhcpru\\\",\\\"title\\\":\\\"Hello world (restored)\\\",\\\"createdAt\\\":\\\"2026-08-06T15:05:00.576Z\\\",\\\"updatedAt\\\":\\\"2026-08-06T15:05:00.623Z\\\",\\\"deletedAt\\\":null}\",\"cmshndgal0000h1voirkhcpru\",null,\"d920ae52d921b3ec3f1360c7f36ef85aea5e572e6c4ee5d4507f8930c567f898\",\"95f773577d2b047f200d93deb1821040e5f3c5521c334fd0a72100c68f4e945a\",\"2026-08-06T15:05:00.632Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.4022930000000997,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.restore",
        "status": "ok",
        "durationMs": 16.027194
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
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"filters\": [\n    {\n      \"field\": \"id\",\n      \"value\": \"cmshndhba0013h1voton12wdo\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"id\": \"cmshndhba0013h1voton12wdo\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmshndgal0000h1voirkhcpru\",\n      \"title\": \"Hello world\",\n      \"createdAt\": \"2026-08-06T15:05:00.646Z\",\n      \"updatedAt\": \"2026-08-06T15:05:00.646Z\",\n      \"deletedAt\": null\n    }\n  ],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 15,\n    \"last_page\": 1,\n    \"total\": 1\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.427135,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.024772,
        "detail": {
          "userId": "cmshndgal0000h1voirkhcpru"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.015487,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8087090000008175,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $4 OFFSET $5",
          "params": "[\"cmshndgal0000h1voirkhcpru\",\"cmshndhba0013h1voton12wdo\",\"default\",\"15\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8677059999999983,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) OFFSET $4) AS \"sub\"",
          "params": "[\"cmshndgal0000h1voirkhcpru\",\"cmshndhba0013h1voton12wdo\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 1.8408
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
        "durationMs": 7.634903,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.064071,
        "detail": {
          "userId": "cmshndgal0000h1voirkhcpru"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.01744,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.describe",
        "status": "ok",
        "durationMs": 0.117772
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
