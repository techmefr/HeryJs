import type { PlaygroundScenario } from './scenario-types';

export const searchScenarios: PlaygroundScenario[] = [
  {
    "id": "filter",
    "label": "Filter on the title",
    "method": "POST",
    "path": "/blog-posts/search",
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"filters\": [\n    {\n      \"field\": \"title\",\n      \"operator\": \"like\",\n      \"value\": \"hello\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 15,\n    \"last_page\": 1,\n    \"total\": 0\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 10.10504,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.050549,
        "detail": {
          "userId": "cmsipyyrx00008jvovv8cxh5g"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.097202,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 7.849216000000524,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"title\"::text LIKE ('%' || $2 || '%') AND \"public\".\"BlogPost\".\"tenantId\" = $3) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $4 OFFSET $5",
          "params": "[\"cmsipyyrx00008jvovv8cxh5g\",\"hello\",\"default\",\"15\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 20.69719200000054,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"title\"::text LIKE ('%' || $2 || '%') AND \"public\".\"BlogPost\".\"tenantId\" = $3) OFFSET $4) AS \"sub\"",
          "params": "[\"cmsipyyrx00008jvovv8cxh5g\",\"hello\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 37.550518
      }
    ]
  },
  {
    "id": "sort-paginate",
    "label": "Sort and paginate",
    "method": "POST",
    "path": "/blog-posts/search",
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"sorts\": [\n    {\n      \"field\": \"createdAt\",\n      \"direction\": \"desc\"\n    }\n  ],\n  \"page\": 1,\n  \"limit\": 10\n}",
    "response": "{\n  \"data\": [\n    {\n      \"id\": \"cmsipyzbf000c8jvoy1lm3ke1\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmsipyyrx00008jvovv8cxh5g\",\n      \"title\": \"Changelog\",\n      \"createdAt\": \"2026-08-07T09:05:29.163Z\",\n      \"updatedAt\": \"2026-08-07T09:05:29.163Z\",\n      \"deletedAt\": null\n    },\n    {\n      \"id\": \"cmsipyzaj000a8jvou1b900gt\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmsipyyrx00008jvovv8cxh5g\",\n      \"title\": \"Release notes\",\n      \"createdAt\": \"2026-08-07T09:05:29.131Z\",\n      \"updatedAt\": \"2026-08-07T09:05:29.131Z\",\n      \"deletedAt\": null\n    },\n    {\n      \"id\": \"cmsipyz7700088jvob93stv60\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmsipyyrx00008jvovv8cxh5g\",\n      \"title\": \"Hello world\",\n      \"createdAt\": \"2026-08-07T09:05:29.011Z\",\n      \"updatedAt\": \"2026-08-07T09:05:29.011Z\",\n      \"deletedAt\": null\n    }\n  ],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 10,\n    \"last_page\": 1,\n    \"total\": 3\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.894142,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.070743,
        "detail": {
          "userId": "cmsipyyrx00008jvovv8cxh5g"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.022212,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.3738299999995434,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"tenantId\" = $2) OFFSET $3) AS \"sub\"",
          "params": "[\"cmsipyyrx00008jvovv8cxh5g\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 4.294836999999461,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"tenantId\" = $2) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $3 OFFSET $4",
          "params": "[\"cmsipyyrx00008jvovv8cxh5g\",\"default\",\"10\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 7.209003
      }
    ]
  },
  {
    "id": "by-id",
    "label": "Look one record up by id",
    "method": "POST",
    "path": "/blog-posts/search",
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"filters\": [\n    {\n      \"field\": \"id\",\n      \"value\": \"cmsipyzcr000e8jvopdyip3pw\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"id\": \"cmsipyzcr000e8jvopdyip3pw\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmsipyyrx00008jvovv8cxh5g\",\n      \"title\": \"Fetched by id\",\n      \"createdAt\": \"2026-08-07T09:05:29.211Z\",\n      \"updatedAt\": \"2026-08-07T09:05:29.211Z\",\n      \"deletedAt\": null\n    }\n  ],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 15,\n    \"last_page\": 1,\n    \"total\": 1\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 8.619508,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.035966,
        "detail": {
          "userId": "cmsipyyrx00008jvovv8cxh5g"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.020349,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.3681529999994382,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) OFFSET $4) AS \"sub\"",
          "params": "[\"cmsipyyrx00008jvovv8cxh5g\",\"cmsipyzcr000e8jvopdyip3pw\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.3076839999994263,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $4 OFFSET $5",
          "params": "[\"cmsipyyrx00008jvovv8cxh5g\",\"cmsipyzcr000e8jvopdyip3pw\",\"default\",\"15\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 4.331566
      }
    ]
  }
];

export const createScenarios: PlaygroundScenario[] = [
  {
    "id": "create",
    "label": "Create a post",
    "method": "POST",
    "path": "/blog-posts/create",
    "request": "POST /blog-posts/create\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"data\": [\n    {\n      \"title\": \"Hello world\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsipyzdx000g8jvohzqh4khx\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsipyyrx00008jvovv8cxh5g\",\n        \"title\": \"Hello world\",\n        \"createdAt\": \"2026-08-07T09:05:29.254Z\",\n        \"updatedAt\": \"2026-08-07T09:05:29.254Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 7.054031,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.078781,
        "detail": {
          "userId": "cmsipyyrx00008jvovv8cxh5g"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.033453,
        "detail": {
          "policy": "canCreateBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.5541599999996834,
        "detail": {
          "sql": "INSERT INTO \"public\".\"BlogPost\" (\"id\",\"tenantId\",\"ownerId\",\"title\",\"createdAt\",\"updatedAt\") VALUES ($1,$2,$3,$4,$5,$6) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"cmsipyzdx000g8jvohzqh4khx\",\"default\",\"cmsipyyrx00008jvovv8cxh5g\",\"Hello world\",\"2026-08-07T09:05:29.254Z\",\"2026-08-07T09:05:29.254Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7013080000006084,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9220129999994242,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.0046089999996184,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsipyze5000h8jvow6hod4ir\",\"default\",\"BlogPost\",\"create\",\"cmsipyzdx000g8jvohzqh4khx\",\"{\\\"id\\\":\\\"cmsipyzdx000g8jvohzqh4khx\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsipyyrx00008jvovv8cxh5g\\\",\\\"title\\\":\\\"Hello world\\\",\\\"createdAt\\\":\\\"2026-08-07T09:05:29.254Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T09:05:29.254Z\\\",\\\"deletedAt\\\":null}\",\"cmsipyyrx00008jvovv8cxh5g\",null,\"908a10a31480bfb8f63f2643139233f589fa00d22d424aec11dec8cf502fd564\",\"e90925371ee471a1eec6aab502e4c100703909dc778d2a7c9dc95735d0c95dfd\",\"2026-08-07T09:05:29.261Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.42789300000004,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.create",
        "status": "ok",
        "durationMs": 12.702073
      }
    ]
  },
  {
    "id": "validation-failed",
    "label": "Invalid payload",
    "method": "POST",
    "path": "/blog-posts/create",
    "request": "POST /blog-posts/create\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"data\": [\n    {}\n  ]\n}",
    "response": "{\n  \"error\": {\n    \"status\": 400,\n    \"key\": \"http.error\",\n    \"message\": \"Bad Request Exception\",\n    \"details\": {\n      \"formErrors\": [],\n      \"fieldErrors\": {\n        \"data\": [\n          \"Invalid input: expected string, received undefined\"\n        ]\n      }\n    }\n  }\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 7.175795,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.080186,
        "detail": {
          "userId": "cmsipyyrx00008jvovv8cxh5g"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.022324,
        "detail": {
          "policy": "canCreateBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.create",
        "status": "error",
        "durationMs": 1.156291,
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
    "label": "Update one field",
    "method": "POST",
    "path": "/blog-posts/update",
    "request": "POST /blog-posts/update\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"data\": [\n    {\n      \"id\": \"cmsipyzew000i8jvo5x6u4t69\",\n      \"title\": \"Hello world (v2)\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsipyzew000i8jvo5x6u4t69\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsipyzew000i8jvo5x6u4t69\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsipyyrx00008jvovv8cxh5g\",\n        \"title\": \"Hello world (v2)\",\n        \"createdAt\": \"2026-08-07T09:05:29.288Z\",\n        \"updatedAt\": \"2026-08-07T09:05:29.320Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 7.224649,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.032566,
        "detail": {
          "userId": "cmsipyyrx00008jvovv8cxh5g"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.069057,
        "detail": {
          "policy": "canUpdateAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.2274089999991702,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsipyzew000i8jvo5x6u4t69\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 4.2508340000003955,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"title\" = $1, \"updatedAt\" = $2 WHERE (\"public\".\"BlogPost\".\"id\" = $3 AND \"public\".\"BlogPost\".\"tenantId\" = $4) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"Hello world (v2)\",\"2026-08-07T09:05:29.320Z\",\"cmsipyzew000i8jvo5x6u4t69\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8020729999998366,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9294780000000173,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.4073010000001887,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsipyzg1000k8jvo1u7hzoo0\",\"default\",\"BlogPost\",\"update\",\"cmsipyzew000i8jvo5x6u4t69\",\"{\\\"id\\\":\\\"cmsipyzew000i8jvo5x6u4t69\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsipyyrx00008jvovv8cxh5g\\\",\\\"title\\\":\\\"Hello world (v2)\\\",\\\"createdAt\\\":\\\"2026-08-07T09:05:29.288Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T09:05:29.320Z\\\",\\\"deletedAt\\\":null}\",\"cmsipyyrx00008jvovv8cxh5g\",null,\"103e310046ce6d9d1027349e8d821e910f95113b2603eb8c047348068da5b163\",\"7682ddc36b2a972b440a48f0760103f773c06b7fbc066665a53905bbffc0b722\",\"2026-08-07T09:05:29.329Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.748685000000478,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.update",
        "status": "ok",
        "durationMs": 19.249165
      }
    ]
  },
  {
    "id": "attach-tags",
    "label": "Attach a tag",
    "method": "POST",
    "path": "/blog-posts/update",
    "request": "POST /blog-posts/update\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"data\": [\n    {\n      \"id\": \"cmsipyzgj000l8jvoz9xjcn07\",\n      \"relations\": {\n        \"tags\": {\n          \"attach\": [\n            \"cmsipyzh1000n8jvof0e5s9zo\"\n          ]\n        }\n      }\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsipyzgj000l8jvoz9xjcn07\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsipyzgj000l8jvoz9xjcn07\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsipyyrx00008jvovv8cxh5g\",\n        \"title\": \"Tagged article\",\n        \"createdAt\": \"2026-08-07T09:05:29.347Z\",\n        \"updatedAt\": \"2026-08-07T09:05:29.347Z\",\n        \"deletedAt\": null,\n        \"tags\": [\n          \"cmsipyzh1000n8jvof0e5s9zo\"\n        ]\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 5.858014,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.023841,
        "detail": {
          "userId": "cmsipyyrx00008jvovv8cxh5g"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.015189,
        "detail": {
          "policy": "canUpdateAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7387559999997393,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsipyzgj000l8jvoz9xjcn07\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7792579999995723,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsipyzgj000l8jvoz9xjcn07\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.6438369999996212,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.1044910000000527,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9474369999998089,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsipyzht000o8jvo6wm6bf9x\",\"default\",\"BlogPost\",\"update\",\"cmsipyzgj000l8jvoz9xjcn07\",\"{\\\"id\\\":\\\"cmsipyzgj000l8jvoz9xjcn07\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsipyyrx00008jvovv8cxh5g\\\",\\\"title\\\":\\\"Tagged article\\\",\\\"createdAt\\\":\\\"2026-08-07T09:05:29.347Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T09:05:29.347Z\\\",\\\"deletedAt\\\":null}\",\"cmsipyyrx00008jvovv8cxh5g\",null,\"72cbee711989c3fd615bb5a66dcbc2bc5f1e9978d8b6f2ff20bbd4228391bf6f\",\"ab5b0dc13067df20efb43f0f5bba24f2570468cbbaec60bd1be7459254e9c420\",\"2026-08-07T09:05:29.393Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.8858799999998155,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.0942060000006677,
        "detail": {
          "sql": "INSERT INTO \"public\".\"BlogPostTag\" (\"tenantId\",\"blogPostId\",\"tagId\",\"createdAt\") VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          "params": "[\"default\",\"cmsipyzgj000l8jvoz9xjcn07\",\"cmsipyzh1000n8jvof0e5s9zo\",\"2026-08-07T09:05:29.402Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.3058529999998427,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.4739899999995032,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPostTag\".\"blogPostId\", \"public\".\"BlogPostTag\".\"tagId\" FROM \"public\".\"BlogPostTag\" WHERE (\"public\".\"BlogPostTag\".\"blogPostId\" = $1 AND \"public\".\"BlogPostTag\".\"tenantId\" = $2) OFFSET $3",
          "params": "[\"cmsipyzgj000l8jvoz9xjcn07\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.update",
        "status": "ok",
        "durationMs": 23.923695
      }
    ]
  }
];

export const deleteScenarios: PlaygroundScenario[] = [
  {
    "id": "soft",
    "label": "Soft delete",
    "method": "POST",
    "path": "/blog-posts/delete",
    "request": "POST /blog-posts/delete\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmsipyzij000p8jvo9qrgotmq\"\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsipyzij000p8jvo9qrgotmq\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsipyzij000p8jvo9qrgotmq\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsipyyrx00008jvovv8cxh5g\",\n        \"title\": \"Hello world\",\n        \"createdAt\": \"2026-08-07T09:05:29.419Z\",\n        \"updatedAt\": \"2026-08-07T09:05:29.444Z\",\n        \"deletedAt\": \"2026-08-07T09:05:29.443Z\"\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 7.173954,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.037107,
        "detail": {
          "userId": "cmsipyyrx00008jvovv8cxh5g"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.077808,
        "detail": {
          "policy": "canDeleteAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.3803610000004483,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsipyzij000p8jvo9qrgotmq\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.697243999999955,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"deletedAt\" = $1, \"updatedAt\" = $2 WHERE (\"public\".\"BlogPost\".\"id\" = $3 AND \"public\".\"BlogPost\".\"tenantId\" = $4) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"2026-08-07T09:05:29.443Z\",\"2026-08-07T09:05:29.444Z\",\"cmsipyzij000p8jvo9qrgotmq\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.808589000000211,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9910639999998239,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8889229999995223,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsipyzjg000r8jvohyttdv7w\",\"default\",\"BlogPost\",\"update\",\"cmsipyzij000p8jvo9qrgotmq\",\"{\\\"id\\\":\\\"cmsipyzij000p8jvo9qrgotmq\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsipyyrx00008jvovv8cxh5g\\\",\\\"title\\\":\\\"Hello world\\\",\\\"createdAt\\\":\\\"2026-08-07T09:05:29.419Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T09:05:29.444Z\\\",\\\"deletedAt\\\":\\\"2026-08-07T09:05:29.443Z\\\"}\",\"cmsipyyrx00008jvovv8cxh5g\",null,\"a8a691f54a895866a077ec5e32901d60ee0917c667d4046524f05b893cebf150\",\"f6b76a29123055fc29d53dbb6c0cfedd7241550f738affbf8e6bf784e6d95e5c\",\"2026-08-07T09:05:29.452Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 4.652733999999327,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.remove",
        "status": "ok",
        "durationMs": 18.213875
      }
    ]
  },
  {
    "id": "hard",
    "label": "Hard delete",
    "method": "POST",
    "path": "/blog-posts/delete",
    "request": "POST /blog-posts/delete\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmsipyzjy000s8jvokyva2yvd\"\n  ],\n  \"mode\": \"hard\"\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsipyzjy000s8jvokyva2yvd\",\n      \"status\": \"ok\",\n      \"data\": null\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.782278,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.027311,
        "detail": {
          "userId": "cmsipyz2000048jvo3uc25juz"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.015439,
        "detail": {
          "policy": "canDeleteAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.945278999999573,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsipyzjy000s8jvokyva2yvd\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.4679230000001553,
        "detail": {
          "sql": "DELETE FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"cmsipyzjy000s8jvokyva2yvd\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.5765380000002551,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8699800000003961,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7436269999998331,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsipyzkw000u8jvosfvm2svv\",\"default\",\"BlogPost\",\"delete\",\"cmsipyzjy000s8jvokyva2yvd\",\"{\\\"id\\\":\\\"cmsipyzjy000s8jvokyva2yvd\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsipyz2000048jvo3uc25juz\\\",\\\"title\\\":\\\"Gone for good\\\",\\\"createdAt\\\":\\\"2026-08-07T09:05:29.470Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T09:05:29.470Z\\\",\\\"deletedAt\\\":null}\",\"cmsipyz2000048jvo3uc25juz\",null,\"294746c99355df4d16c30cd102a6752ecdbe75042ae7c8de5d74e3edc998d859\",\"a5a7ff62fed213394f9102fc0c13aff80d2617abecd65c777939a3a91f29397f\",\"2026-08-07T09:05:29.504Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.5457449999994424,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.remove",
        "status": "ok",
        "durationMs": 15.026859
      }
    ]
  }
];

export const restoreScenarios: PlaygroundScenario[] = [
  {
    "id": "restore",
    "label": "Restore",
    "method": "POST",
    "path": "/blog-posts/restore",
    "request": "POST /blog-posts/restore\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmsipyzla000v8jvo96kusyv2\"\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsipyzla000v8jvo96kusyv2\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsipyzla000v8jvo96kusyv2\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsipyyrx00008jvovv8cxh5g\",\n        \"title\": \"Hello world\",\n        \"createdAt\": \"2026-08-07T09:05:29.518Z\",\n        \"updatedAt\": \"2026-08-07T09:05:29.569Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 7.354175,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.024722,
        "detail": {
          "userId": "cmsipyyrx00008jvovv8cxh5g"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.106988,
        "detail": {
          "policy": "canRestoreAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.776412000000164,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsipyzla000v8jvo96kusyv2\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 5.140716999999313,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"deletedAt\" = $1, \"updatedAt\" = $2 WHERE (\"public\".\"BlogPost\".\"id\" = $3 AND \"public\".\"BlogPost\".\"tenantId\" = $4) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[null,\"2026-08-07T09:05:29.569Z\",\"cmsipyzla000v8jvo96kusyv2\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7788049999999203,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7441380000000208,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7286519999997836,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsipyzmy000y8jvon0xym0ii\",\"default\",\"BlogPost\",\"update\",\"cmsipyzla000v8jvo96kusyv2\",\"{\\\"id\\\":\\\"cmsipyzla000v8jvo96kusyv2\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsipyyrx00008jvovv8cxh5g\\\",\\\"title\\\":\\\"Hello world\\\",\\\"createdAt\\\":\\\"2026-08-07T09:05:29.518Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T09:05:29.569Z\\\",\\\"deletedAt\\\":null}\",\"cmsipyyrx00008jvovv8cxh5g\",null,\"227aac6caec058ab9594f258ca39f5a226bb8d71edcf913e9c87240482d1aa5a\",\"9cbf82bd9116a0c2b655ece3bbd72365982b3d539f4ca8f6e3b88a2f549b8ac5\",\"2026-08-07T09:05:29.578Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 5.449015999999574,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.restore",
        "status": "ok",
        "durationMs": 18.707288
      }
    ]
  },
  {
    "id": "restore-with-patch",
    "label": "Restore with a fix",
    "method": "POST",
    "path": "/blog-posts/restore",
    "request": "POST /blog-posts/restore\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmsipyzni000z8jvocb23fjd9\"\n  ],\n  \"patch\": {\n    \"title\": \"Hello world (restored)\"\n  }\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmsipyzni000z8jvocb23fjd9\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmsipyzni000z8jvocb23fjd9\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmsipyyrx00008jvovv8cxh5g\",\n        \"title\": \"Hello world (restored)\",\n        \"createdAt\": \"2026-08-07T09:05:29.598Z\",\n        \"updatedAt\": \"2026-08-07T09:05:29.646Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.428677,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.029052,
        "detail": {
          "userId": "cmsipyyrx00008jvovv8cxh5g"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.015875,
        "detail": {
          "policy": "canRestoreAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7618730000003779,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmsipyzni000z8jvocb23fjd9\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.620668999999907,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"title\" = $1, \"deletedAt\" = $2, \"updatedAt\" = $3 WHERE (\"public\".\"BlogPost\".\"id\" = $4 AND \"public\".\"BlogPost\".\"tenantId\" = $5) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"Hello world (restored)\",null,\"2026-08-07T09:05:29.646Z\",\"cmsipyzni000z8jvocb23fjd9\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.5834679999998116,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.6732320000000982,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"sequence\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.706478000000061,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"sequence\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmsipyzoz00128jvozreqt5km\",\"default\",\"BlogPost\",\"update\",\"cmsipyzni000z8jvocb23fjd9\",\"{\\\"id\\\":\\\"cmsipyzni000z8jvocb23fjd9\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmsipyyrx00008jvovv8cxh5g\\\",\\\"title\\\":\\\"Hello world (restored)\\\",\\\"createdAt\\\":\\\"2026-08-07T09:05:29.598Z\\\",\\\"updatedAt\\\":\\\"2026-08-07T09:05:29.646Z\\\",\\\"deletedAt\\\":null}\",\"cmsipyyrx00008jvovv8cxh5g\",null,\"4c53eee67dfa13c984e6c3116ecc1c36b5509d2fb91e2fd5cc51507a72b8c318\",\"50ab28737f72e129b1a1be7b9a1ad7ee9a4be54cf070bd4463c9a767812dff20\",\"2026-08-07T09:05:29.651Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.394191000000319,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.restore",
        "status": "ok",
        "durationMs": 12.61793
      }
    ]
  }
];

export const detailsScenarios: PlaygroundScenario[] = [
  {
    "id": "read-one",
    "label": "Read one record",
    "method": "POST",
    "path": "/blog-posts/search",
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"filters\": [\n    {\n      \"field\": \"id\",\n      \"value\": \"cmsipyzpe00138jvo8sne3lxj\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"id\": \"cmsipyzpe00138jvo8sne3lxj\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmsipyyrx00008jvovv8cxh5g\",\n      \"title\": \"Hello world\",\n      \"createdAt\": \"2026-08-07T09:05:29.666Z\",\n      \"updatedAt\": \"2026-08-07T09:05:29.666Z\",\n      \"deletedAt\": null\n    }\n  ],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 15,\n    \"last_page\": 1,\n    \"total\": 1\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 5.543334,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.022719,
        "detail": {
          "userId": "cmsipyyrx00008jvovv8cxh5g"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.015151,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.7877650000000358,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) OFFSET $4) AS \"sub\"",
          "params": "[\"cmsipyyrx00008jvovv8cxh5g\",\"cmsipyzpe00138jvo8sne3lxj\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.0830669999995735,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $4 OFFSET $5",
          "params": "[\"cmsipyyrx00008jvovv8cxh5g\",\"cmsipyzpe00138jvo8sne3lxj\",\"default\",\"15\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 1.911512
      }
    ]
  },
  {
    "id": "describe",
    "label": "The resource contract",
    "method": "GET",
    "path": "/blog-posts/describe",
    "request": "GET /blog-posts/describe\nAuthorization: Bearer <token>",
    "response": "{\n  \"data\": {\n    \"fields\": [\n      {\n        \"name\": \"title\",\n        \"type\": \"string\",\n        \"optional\": false\n      }\n    ],\n    \"sorts\": [\n      \"createdAt\"\n    ],\n    \"filters\": [\n      \"id\",\n      \"title\"\n    ],\n    \"selects\": [\n      \"id\",\n      \"ownerId\",\n      \"title\",\n      \"createdAt\",\n      \"updatedAt\",\n      \"deletedAt\"\n    ],\n    \"includes\": {\n      \"notes\": {\n        \"type\": \"hasMany\",\n        \"foreignKey\": \"blogPostId\",\n        \"childDelegate\": \"blogPostNote\",\n        \"filters\": [\n          \"body\"\n        ],\n        \"sorts\": [\n          \"createdAt\"\n        ],\n        \"selects\": [\n          \"id\",\n          \"body\",\n          \"rating\",\n          \"createdAt\"\n        ]\n      },\n      \"comments\": {\n        \"type\": \"morphMany\",\n        \"foreignKey\": \"commentableId\",\n        \"discriminator\": \"commentableType\",\n        \"discriminatorValue\": \"BlogPost\",\n        \"childDelegate\": \"comment\",\n        \"filters\": [\n          \"body\"\n        ],\n        \"sorts\": [\n          \"createdAt\"\n        ],\n        \"selects\": [\n          \"id\",\n          \"body\",\n          \"createdAt\"\n        ]\n      }\n    },\n    \"aggregates\": {\n      \"notes\": {\n        \"type\": \"hasMany\",\n        \"foreignKey\": \"blogPostId\",\n        \"childDelegate\": \"blogPostNote\",\n        \"filters\": [\n          \"body\"\n        ],\n        \"fields\": [\n          \"rating\"\n        ]\n      },\n      \"comments\": {\n        \"type\": \"morphMany\",\n        \"foreignKey\": \"commentableId\",\n        \"discriminator\": \"commentableType\",\n        \"discriminatorValue\": \"BlogPost\",\n        \"childDelegate\": \"comment\",\n        \"filters\": [\n          \"body\"\n        ],\n        \"fields\": []\n      }\n    },\n    \"limits\": [\n      10,\n      15,\n      20\n    ],\n    \"defaultLimit\": 15,\n    \"paginated\": true,\n    \"rules\": {\n      \"create\": {\n        \"$schema\": \"https://json-schema.org/draft/2020-12/schema\",\n        \"type\": \"object\",\n        \"properties\": {\n          \"title\": {\n            \"type\": \"string\",\n            \"minLength\": 1,\n            \"maxLength\": 255\n          }\n        },\n        \"required\": [\n          \"title\"\n        ],\n        \"additionalProperties\": false\n      },\n      \"update\": {\n        \"$schema\": \"https://json-schema.org/draft/2020-12/schema\",\n        \"type\": \"object\",\n        \"properties\": {\n          \"title\": {\n            \"type\": \"string\",\n            \"minLength\": 1,\n            \"maxLength\": 255\n          }\n        },\n        \"additionalProperties\": false\n      }\n    }\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 6.291216,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 0.039501,
        "detail": {
          "userId": "cmsipyyrx00008jvovv8cxh5g"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.016495,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.describe",
        "status": "ok",
        "durationMs": 0.10857
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
