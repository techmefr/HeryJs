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
        "durationMs": 7.240197,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.040572,
        "detail": {
          "userId": "cmsinc2yj0000gmvo75kb32du"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.077285,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 6.443833000000268,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"title\"::text LIKE ('%' || $2 || '%') AND \"public\".\"BlogPost\".\"tenantId\" = $3) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $4 OFFSET $5",
          "params": "[\"cmsinc2yj0000gmvo75kb32du\",\"hello\",\"default\",\"15\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 14.578058999999485,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"title\"::text LIKE ('%' || $2 || '%') AND \"public\".\"BlogPost\".\"tenantId\" = $3) OFFSET $4) AS \"sub\"",
          "params": "[\"cmsinc2yj0000gmvo75kb32du\",\"hello\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 24.91324
      }
    ]
  },
  {
    "id": "sort-paginate",
    "label": "Trier et paginer",
    "method": "POST",
    "path": "/blog-posts/search",
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"sorts\": [\n    {\n      \"field\": \"createdAt\",\n      \"direction\": \"desc\"\n    }\n  ],\n  \"page\": 1,\n  \"limit\": 10\n}",
    "response": "{\n  \"data\": [\n    {\n      \"id\": \"cmsinc3g2000cgmvo5tqx7dra\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmsinc2yj0000gmvo75kb32du\",\n      \"title\": \"Changelog\",\n      \"createdAt\": \"2026-08-07T07:51:42.194Z\",\n      \"updatedAt\": \"2026-08-07T07:51:42.194Z\",\n      \"deletedAt\": null\n    },\n    {\n      \"id\": \"cmsinc3f0000agmvot77r20te\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmsinc2yj0000gmvo75kb32du\",\n      \"title\": \"Release notes\",\n      \"createdAt\": \"2026-08-07T07:51:42.156Z\",\n      \"updatedAt\": \"2026-08-07T07:51:42.156Z\",\n      \"deletedAt\": null\n    },\n    {\n      \"id\": \"cmsinc3ci0008gmvokz6eq5xa\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmsinc2yj0000gmvo75kb32du\",\n      \"title\": \"Hello world\",\n      \"createdAt\": \"2026-08-07T07:51:42.066Z\",\n      \"updatedAt\": \"2026-08-07T07:51:42.066Z\",\n      \"deletedAt\": null\n    }\n  ],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 10,\n    \"last_page\": 1,\n    \"total\": 3\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.086357,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.06244,
        "detail": {
          "userId": "cmsinc2yj0000gmvo75kb32du"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.023675,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.2794410000005882,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"tenantId\" = $2) OFFSET $3) AS \"sub\"",
          "params": "[\"cmsinc2yj0000gmvo75kb32du\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.556984000000739,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"tenantId\" = $2) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $3 OFFSET $4",
          "params": "[\"cmsinc2yj0000gmvo75kb32du\",\"default\",\"10\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 5.12543
      }
    ]
  },
  {
    "id": "by-id",
    "label": "Chercher par identifiant",
    "method": "POST",
    "path": "/blog-posts/search",
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"filters\": [\n    {\n      \"field\": \"id\",\n      \"value\": \"cmsinc3ha000egmvoqvctpyo0\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"id\": \"cmsinc3ha000egmvoqvctpyo0\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmsinc2yj0000gmvo75kb32du\",\n      \"title\": \"Fetched by id\",\n      \"createdAt\": \"2026-08-07T07:51:42.238Z\",\n      \"updatedAt\": \"2026-08-07T07:51:42.238Z\",\n      \"deletedAt\": null\n    }\n  ],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 15,\n    \"last_page\": 1,\n    \"total\": 1\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.28868,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.026792,
        "detail": {
          "userId": "cmsinc2yj0000gmvo75kb32du"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.018088,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.2725659999996424,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $4 OFFSET $5",
          "params": "[\"cmsinc2yj0000gmvo75kb32du\",\"cmsinc3ha000egmvoqvctpyo0\",\"default\",\"15\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.0177640000001702,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) OFFSET $4) AS \"sub\"",
          "params": "[\"cmsinc2yj0000gmvo75kb32du\",\"cmsinc3ha000egmvoqvctpyo0\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 3.403602
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
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsinc3i9000ggmvopscx1xq8\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsinc2yj0000gmvo75kb32du\",\n        \"title\": \"Hello world\",\n        \"createdAt\": \"2026-08-07T07:51:42.274Z\",\n        \"updatedAt\": \"2026-08-07T07:51:42.274Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.363923,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.034516,
        "detail": {
          "userId": "cmsinc2yj0000gmvo75kb32du"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.018284,
        "detail": {
          "policy": "canCreateBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 5.8019500000000335,
        "detail": {
          "sql": "INSERT INTO \"public\".\"BlogPost\" (\"id\",\"tenantId\",\"ownerId\",\"title\",\"createdAt\",\"updatedAt\") VALUES ($1,$2,$3,$4,$5,$6) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"cmsinc3i9000ggmvopscx1xq8\",\"default\",\"cmsinc2yj0000gmvo75kb32du\",\"Hello world\",\"2026-08-07T07:51:42.274Z\",\"2026-08-07T07:51:42.274Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.6041949999998906,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.856127999999444,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9342820000001666,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsinc3ij000hgmvonem8q0vh\",\"default\",\"BlogPost\",\"create\",\"cmsinc3i9000ggmvopscx1xq8\",\"{\\\"id\\\":\\\"cmsinc3i9000ggmvopscx1xq8\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsinc2yj0000gmvo75kb32du\\\",\\\"title\\\":\\\"Hello world\\\",\\\"createdAt\\\":\\\"2026-08-07T07:51:42.274Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T07:51:42.274Z\\\",\\\"deletedAt\\\":null}\",\"cmsinc2yj0000gmvo75kb32du\",null,\"ec8769631ebb1ebc7a5167d6e3997715ff648004c1ca265dc69967cf31505302\",\"cdacae3fff1cf3ed4f51dec735000cea57519f2da0c4a720c14e77f823d3f7d6\",\"2026-08-07T07:51:42.283Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.054414000000179,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.create",
        "status": "ok",
        "durationMs": 15.050444
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
        "durationMs": 5.819563,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.031304,
        "detail": {
          "userId": "cmsinc2yj0000gmvo75kb32du"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.028711,
        "detail": {
          "policy": "canCreateBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.create",
        "status": "error",
        "durationMs": 1.090365,
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
    "request": "POST /blog-posts/update\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"data\": [\n    {\n      \"id\": \"cmsinc3j9000igmvo7b2z5tn4\",\n      \"title\": \"Hello world (v2)\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsinc3j9000igmvo7b2z5tn4\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsinc3j9000igmvo7b2z5tn4\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsinc2yj0000gmvo75kb32du\",\n        \"title\": \"Hello world (v2)\",\n        \"createdAt\": \"2026-08-07T07:51:42.309Z\",\n        \"updatedAt\": \"2026-08-07T07:51:42.342Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.441739,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.030238,
        "detail": {
          "userId": "cmsinc2yj0000gmvo75kb32du"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.088079,
        "detail": {
          "policy": "canUpdateAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.6756830000003902,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsinc3j9000igmvo7b2z5tn4\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.8048760000001494,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"title\" = $1, \"updatedAt\" = $2 WHERE (\"public\".\"BlogPost\".\"id\" = $3 AND \"public\".\"BlogPost\".\"tenantId\" = $4) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"Hello world (v2)\",\"2026-08-07T07:51:42.342Z\",\"cmsinc3j9000igmvo7b2z5tn4\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.5254809999996723,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.5359589999998207,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9348270000000412,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsinc3kc000kgmvo60a2vqqj\",\"default\",\"BlogPost\",\"update\",\"cmsinc3j9000igmvo7b2z5tn4\",\"{\\\"id\\\":\\\"cmsinc3j9000igmvo7b2z5tn4\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsinc2yj0000gmvo75kb32du\\\",\\\"title\\\":\\\"Hello world (v2)\\\",\\\"createdAt\\\":\\\"2026-08-07T07:51:42.309Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T07:51:42.342Z\\\",\\\"deletedAt\\\":null}\",\"cmsinc2yj0000gmvo75kb32du\",null,\"35a1d6587956adf6fba98311d055cda9cc078a5ff87efded74d17f659a46e6f6\",\"4360860ab7cac5f6595918cd3b2e43706d7ceedf17d8e077426a4c1aa5751e22\",\"2026-08-07T07:51:42.348Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 5.1163729999998395,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.update",
        "status": "ok",
        "durationMs": 16.108304
      }
    ]
  },
  {
    "id": "attach-tags",
    "label": "Attacher un tag",
    "method": "POST",
    "path": "/blog-posts/update",
    "request": "POST /blog-posts/update\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"data\": [\n    {\n      \"id\": \"cmsinc3ks000lgmvoc5gb0pga\",\n      \"relations\": {\n        \"tags\": {\n          \"attach\": [\n            \"cmsinc3l5000ngmvourvgbakw\"\n          ]\n        }\n      }\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsinc3ks000lgmvoc5gb0pga\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsinc3ks000lgmvoc5gb0pga\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsinc2yj0000gmvo75kb32du\",\n        \"title\": \"Tagged article\",\n        \"createdAt\": \"2026-08-07T07:51:42.364Z\",\n        \"updatedAt\": \"2026-08-07T07:51:42.364Z\",\n        \"deletedAt\": null,\n        \"tags\": [\n          \"cmsinc3l5000ngmvourvgbakw\"\n        ]\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.308666,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.022631,
        "detail": {
          "userId": "cmsinc2yj0000gmvo75kb32du"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.014189,
        "detail": {
          "policy": "canUpdateAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.727827000000616,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsinc3ks000lgmvoc5gb0pga\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9063270000006014,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsinc3ks000lgmvoc5gb0pga\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.48568100000011327,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8605530000004364,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8430669999997917,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsinc3ly000ogmvoqmo4zok8\",\"default\",\"BlogPost\",\"update\",\"cmsinc3ks000lgmvoc5gb0pga\",\"{\\\"id\\\":\\\"cmsinc3ks000lgmvoc5gb0pga\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsinc2yj0000gmvo75kb32du\\\",\\\"title\\\":\\\"Tagged article\\\",\\\"createdAt\\\":\\\"2026-08-07T07:51:42.364Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T07:51:42.364Z\\\",\\\"deletedAt\\\":null}\",\"cmsinc2yj0000gmvo75kb32du\",null,\"555337ca0006bdaee0a94fb364135788b01e90ed171f2d218d1aeca56daef207\",\"83ccea88f5652c2ce35e13cd06b62911382292ec4230a75eaa60d0a1f1190c33\",\"2026-08-07T07:51:42.406Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.4538570000004256,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.7584379999998418,
        "detail": {
          "sql": "INSERT INTO \"public\".\"BlogPostTag\" (\"tenantId\",\"blogPostId\",\"tagId\",\"createdAt\") VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          "params": "[\"default\",\"cmsinc3ks000lgmvoc5gb0pga\",\"cmsinc3l5000ngmvourvgbakw\",\"2026-08-07T07:51:42.413Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.2975450000003548,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7609599999996135,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPostTag\".\"blogPostId\", \"public\".\"BlogPostTag\".\"tagId\" FROM \"public\".\"BlogPostTag\" WHERE (\"public\".\"BlogPostTag\".\"blogPostId\" = $1 AND \"public\".\"BlogPostTag\".\"tenantId\" = $2) OFFSET $3",
          "params": "[\"cmsinc3ks000lgmvoc5gb0pga\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.update",
        "status": "ok",
        "durationMs": 20.408242
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
    "request": "POST /blog-posts/delete\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmsinc3mj000pgmvozj1een3k\"\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsinc3mj000pgmvozj1een3k\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsinc3mj000pgmvozj1een3k\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsinc2yj0000gmvo75kb32du\",\n        \"title\": \"Hello world\",\n        \"createdAt\": \"2026-08-07T07:51:42.428Z\",\n        \"updatedAt\": \"2026-08-07T07:51:42.447Z\",\n        \"deletedAt\": \"2026-08-07T07:51:42.446Z\"\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 5.268085,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.023847,
        "detail": {
          "userId": "cmsinc2yj0000gmvo75kb32du"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.068524,
        "detail": {
          "policy": "canDeleteAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8533010000001013,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsinc3mj000pgmvozj1een3k\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 4.125358999999662,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"deletedAt\" = $1, \"updatedAt\" = $2 WHERE (\"public\".\"BlogPost\".\"id\" = $3 AND \"public\".\"BlogPost\".\"tenantId\" = $4) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"2026-08-07T07:51:42.446Z\",\"2026-08-07T07:51:42.447Z\",\"cmsinc3mj000pgmvozj1een3k\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.5046740000007048,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.6761210000004212,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9949930000002496,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsinc3na000rgmvo553tudv0\",\"default\",\"BlogPost\",\"update\",\"cmsinc3mj000pgmvozj1een3k\",\"{\\\"id\\\":\\\"cmsinc3mj000pgmvozj1een3k\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsinc2yj0000gmvo75kb32du\\\",\\\"title\\\":\\\"Hello world\\\",\\\"createdAt\\\":\\\"2026-08-07T07:51:42.428Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T07:51:42.447Z\\\",\\\"deletedAt\\\":\\\"2026-08-07T07:51:42.446Z\\\"}\",\"cmsinc2yj0000gmvo75kb32du\",null,\"c30151301fa687776b1a56984b680f5d0600e041e3a48652dbe9434c76057b75\",\"58f43f232f8fa222ae0b81b7e61acc9834fc4fbf1942687c0c82ec7af9309b68\",\"2026-08-07T07:51:42.454Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.321037000000615,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.remove",
        "status": "ok",
        "durationMs": 13.655729
      }
    ]
  },
  {
    "id": "hard",
    "label": "Suppression définitive",
    "method": "POST",
    "path": "/blog-posts/delete",
    "request": "POST /blog-posts/delete\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmsinc3nm000sgmvo4fq1q8tt\"\n  ],\n  \"mode\": \"hard\"\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsinc3nm000sgmvo4fq1q8tt\",\n      \"status\": \"ok\",\n      \"data\": null\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 4.50376,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.021215,
        "detail": {
          "userId": "cmsinc37v0004gmvoom6ntk0x"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.013654,
        "detail": {
          "policy": "canDeleteAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.6739040000002205,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsinc3nm000sgmvo4fq1q8tt\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.7972370000006777,
        "detail": {
          "sql": "DELETE FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"cmsinc3nm000sgmvo4fq1q8tt\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.4367580000007365,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.5688550000004398,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.6717029999999795,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsinc3oc000ugmvoxamgn4hc\",\"default\",\"BlogPost\",\"delete\",\"cmsinc3nm000sgmvo4fq1q8tt\",\"{\\\"id\\\":\\\"cmsinc3nm000sgmvo4fq1q8tt\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsinc37v0004gmvoom6ntk0x\\\",\\\"title\\\":\\\"Gone for good\\\",\\\"createdAt\\\":\\\"2026-08-07T07:51:42.466Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T07:51:42.466Z\\\",\\\"deletedAt\\\":null}\",\"cmsinc37v0004gmvoom6ntk0x\",null,\"f3682b32e73fde4e291f368b7408d14065653850d7f6fd96ab2a5d61ac4123ef\",\"c5f6506061afe3b8e697e93508c1643ac59d25a25e75e1098be60d86f2b01fcc\",\"2026-08-07T07:51:42.492Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.16718899999978,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.remove",
        "status": "ok",
        "durationMs": 12.726726
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
    "request": "POST /blog-posts/restore\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmsinc3oo000vgmvo3z7svgnf\"\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsinc3oo000vgmvo3z7svgnf\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsinc3oo000vgmvo3z7svgnf\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsinc2yj0000gmvo75kb32du\",\n        \"title\": \"Hello world\",\n        \"createdAt\": \"2026-08-07T07:51:42.504Z\",\n        \"updatedAt\": \"2026-08-07T07:51:42.542Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 5.90991,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.063436,
        "detail": {
          "userId": "cmsinc2yj0000gmvo75kb32du"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.067117,
        "detail": {
          "policy": "canRestoreAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.5639490000003207,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsinc3oo000vgmvo3z7svgnf\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.50626899999952,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"deletedAt\" = $1, \"updatedAt\" = $2 WHERE (\"public\".\"BlogPost\".\"id\" = $3 AND \"public\".\"BlogPost\".\"tenantId\" = $4) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[null,\"2026-08-07T07:51:42.542Z\",\"cmsinc3oo000vgmvo3z7svgnf\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.5639750000000276,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.627093000000059,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.5964249999997264,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsinc3pv000ygmvodv0o3ztc\",\"default\",\"BlogPost\",\"update\",\"cmsinc3oo000vgmvo3z7svgnf\",\"{\\\"id\\\":\\\"cmsinc3oo000vgmvo3z7svgnf\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsinc2yj0000gmvo75kb32du\\\",\\\"title\\\":\\\"Hello world\\\",\\\"createdAt\\\":\\\"2026-08-07T07:51:42.504Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T07:51:42.542Z\\\",\\\"deletedAt\\\":null}\",\"cmsinc2yj0000gmvo75kb32du\",null,\"2a1959f1356f956eed393fe6dcb96a66a7a4746f5f629fc4a0280d8365137dcf\",\"184c91d6ff3b144ba9d4a37e5312732920fd2634b63e1e27cf12eb40e8a1c66b\",\"2026-08-07T07:51:42.547Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.150118000000475,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.restore",
        "status": "ok",
        "durationMs": 10.747827
      }
    ]
  },
  {
    "id": "restore-with-patch",
    "label": "Restaurer avec un correctif",
    "method": "POST",
    "path": "/blog-posts/restore",
    "request": "POST /blog-posts/restore\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmsinc3q6000zgmvo2qmj1d6p\"\n  ],\n  \"patch\": {\n    \"title\": \"Hello world (restored)\"\n  }\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsinc3q6000zgmvo2qmj1d6p\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsinc3q6000zgmvo2qmj1d6p\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsinc2yj0000gmvo75kb32du\",\n        \"title\": \"Hello world (restored)\",\n        \"createdAt\": \"2026-08-07T07:51:42.558Z\",\n        \"updatedAt\": \"2026-08-07T07:51:42.596Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 5.62684,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.025553,
        "detail": {
          "userId": "cmsinc2yj0000gmvo75kb32du"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.015371,
        "detail": {
          "policy": "canRestoreAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.6679180000000997,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsinc3q6000zgmvo2qmj1d6p\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.7290670000002137,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"title\" = $1, \"deletedAt\" = $2, \"updatedAt\" = $3 WHERE (\"public\".\"BlogPost\".\"id\" = $4 AND \"public\".\"BlogPost\".\"tenantId\" = $5) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"Hello world (restored)\",null,\"2026-08-07T07:51:42.596Z\",\"cmsinc3q6000zgmvo2qmj1d6p\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.3469889999996667,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.6983230000005278,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.2376530000001367,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsinc3re0012gmvoiis7v593\",\"default\",\"BlogPost\",\"update\",\"cmsinc3q6000zgmvo2qmj1d6p\",\"{\\\"id\\\":\\\"cmsinc3q6000zgmvo2qmj1d6p\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsinc2yj0000gmvo75kb32du\\\",\\\"title\\\":\\\"Hello world (restored)\\\",\\\"createdAt\\\":\\\"2026-08-07T07:51:42.558Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T07:51:42.596Z\\\",\\\"deletedAt\\\":null}\",\"cmsinc2yj0000gmvo75kb32du\",null,\"be0c22fc5b5e5478e759354f506300d9561da8a30a60993ea7e71a194f6b2aa5\",\"5cd317531b7239ab98cd2f9078a0db2bf1fc4c929a685eff5c6e0e11683a01a3\",\"2026-08-07T07:51:42.602Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.8865859999996246,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.restore",
        "status": "ok",
        "durationMs": 13.180463
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
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"filters\": [\n    {\n      \"field\": \"id\",\n      \"value\": \"cmsinc3rs0013gmvogjy9inub\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"id\": \"cmsinc3rs0013gmvogjy9inub\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmsinc2yj0000gmvo75kb32du\",\n      \"title\": \"Hello world\",\n      \"createdAt\": \"2026-08-07T07:51:42.616Z\",\n      \"updatedAt\": \"2026-08-07T07:51:42.616Z\",\n      \"deletedAt\": null\n    }\n  ],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 15,\n    \"last_page\": 1,\n    \"total\": 1\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 4.797741,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.020938,
        "detail": {
          "userId": "cmsinc2yj0000gmvo75kb32du"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.013774,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.6823679999997694,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $4 OFFSET $5",
          "params": "[\"cmsinc2yj0000gmvo75kb32du\",\"cmsinc3rs0013gmvogjy9inub\",\"default\",\"15\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7524929999999586,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) OFFSET $4) AS \"sub\"",
          "params": "[\"cmsinc2yj0000gmvo75kb32du\",\"cmsinc3rs0013gmvogjy9inub\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 1.551174
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
        "durationMs": 5.222911,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.036364,
        "detail": {
          "userId": "cmsinc2yj0000gmvo75kb32du"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.014163,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.describe",
        "status": "ok",
        "durationMs": 0.113912
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
