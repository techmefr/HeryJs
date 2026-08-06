import type { PlaygroundScenario } from './scenario-types';

export const searchScenarios: PlaygroundScenario[] = [
  {
    "id": "filter",
    "label": "Filtrer sur le titre",
    "method": "POST",
    "path": "/blog-posts/search",
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"filters\": [\n    {\n      \"field\": \"title\",\n      \"operator\": \"like\",\n      \"value\": \"hello\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 15,\n    \"total\": 0,\n    \"last_page\": 1\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 30.893945,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 19.042086,
        "detail": {
          "userId": "cmshl8udk0000wlvoqvwerae3"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.112334,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 12.6882999999998,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"title\"::text LIKE ('%' || $2 || '%') AND \"public\".\"BlogPost\".\"tenantId\" = $3) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $4 OFFSET $5",
          "params": "[\"cmshl8udk0000wlvoqvwerae3\",\"hello\",\"default\",\"15\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 32.95017899999948,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"title\"::text LIKE ('%' || $2 || '%') AND \"public\".\"BlogPost\".\"tenantId\" = $3) OFFSET $4) AS \"sub\"",
          "params": "[\"cmshl8udk0000wlvoqvwerae3\",\"hello\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 55.165904
      }
    ]
  },
  {
    "id": "sort-paginate",
    "label": "Trier et paginer",
    "method": "POST",
    "path": "/blog-posts/search",
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"sorts\": [\n    {\n      \"field\": \"createdAt\",\n      \"direction\": \"desc\"\n    }\n  ],\n  \"page\": 1,\n  \"limit\": 10\n}",
    "response": "{\n  \"data\": [\n    {\n      \"id\": \"cmshl8vrk000cwlvogbxhmluj\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmshl8udk0000wlvoqvwerae3\",\n      \"title\": \"Changelog\",\n      \"createdAt\": \"2026-08-06T14:05:26.864Z\",\n      \"updatedAt\": \"2026-08-06T14:05:26.864Z\",\n      \"deletedAt\": null\n    },\n    {\n      \"id\": \"cmshl8vpi000awlvo1oeoylxy\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmshl8udk0000wlvoqvwerae3\",\n      \"title\": \"Release notes\",\n      \"createdAt\": \"2026-08-06T14:05:26.790Z\",\n      \"updatedAt\": \"2026-08-06T14:05:26.790Z\",\n      \"deletedAt\": null\n    },\n    {\n      \"id\": \"cmshl8ver0008wlvoa3uzgzap\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmshl8udk0000wlvoqvwerae3\",\n      \"title\": \"Hello world\",\n      \"createdAt\": \"2026-08-06T14:05:26.403Z\",\n      \"updatedAt\": \"2026-08-06T14:05:26.403Z\",\n      \"deletedAt\": null\n    }\n  ],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 10,\n    \"total\": 3,\n    \"last_page\": 1\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 17.376586,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 17.416946,
        "detail": {
          "userId": "cmshl8udk0000wlvoqvwerae3"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.057514,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.040279000000737,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"tenantId\" = $2) OFFSET $3) AS \"sub\"",
          "params": "[\"cmshl8udk0000wlvoqvwerae3\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.8928130000003875,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"tenantId\" = $2) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $3 OFFSET $4",
          "params": "[\"cmshl8udk0000wlvoqvwerae3\",\"default\",\"10\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 9.929174
      }
    ]
  },
  {
    "id": "by-id",
    "label": "Chercher par identifiant",
    "method": "POST",
    "path": "/blog-posts/search",
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"filters\": [\n    {\n      \"field\": \"id\",\n      \"value\": \"cmshl8vuy000ewlvobxfwwng8\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"id\": \"cmshl8vuy000ewlvobxfwwng8\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmshl8udk0000wlvoqvwerae3\",\n      \"title\": \"Fetched by id\",\n      \"createdAt\": \"2026-08-06T14:05:26.986Z\",\n      \"updatedAt\": \"2026-08-06T14:05:26.986Z\",\n      \"deletedAt\": null\n    }\n  ],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 15,\n    \"total\": 1,\n    \"last_page\": 1\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 16.167231,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 25.218023,
        "detail": {
          "userId": "cmshl8udk0000wlvoqvwerae3"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.04275,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.593184999999721,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $4 OFFSET $5",
          "params": "[\"cmshl8udk0000wlvoqvwerae3\",\"cmshl8vuy000ewlvobxfwwng8\",\"default\",\"15\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.095670999999129,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) OFFSET $4) AS \"sub\"",
          "params": "[\"cmshl8udk0000wlvoqvwerae3\",\"cmshl8vuy000ewlvobxfwwng8\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 6.334511
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
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmshl8vyv000gwlvo6q17thp6\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmshl8udk0000wlvoqvwerae3\",\n        \"title\": \"Hello world\",\n        \"createdAt\": \"2026-08-06T14:05:27.127Z\",\n        \"updatedAt\": \"2026-08-06T14:05:27.127Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 14.99003,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 9.749863,
        "detail": {
          "userId": "cmshl8udk0000wlvoqvwerae3"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.085401,
        "detail": {
          "policy": "canCreateBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 4.391691999999239,
        "detail": {
          "sql": "INSERT INTO \"public\".\"BlogPost\" (\"id\",\"tenantId\",\"ownerId\",\"title\",\"createdAt\",\"updatedAt\") VALUES ($1,$2,$3,$4,$5,$6) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"cmshl8vyv000gwlvo6q17thp6\",\"default\",\"cmshl8udk0000wlvoqvwerae3\",\"Hello world\",\"2026-08-06T14:05:27.127Z\",\"2026-08-06T14:05:27.127Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.3471780000018043,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.945117000001119,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"createdAt\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.6430559999989782,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmshl8vza000hwlvoawd4gfz2\",\"default\",\"BlogPost\",\"create\",\"cmshl8vyv000gwlvo6q17thp6\",\"{\\\"id\\\":\\\"cmshl8vyv000gwlvo6q17thp6\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmshl8udk0000wlvoqvwerae3\\\",\\\"title\\\":\\\"Hello world\\\",\\\"createdAt\\\":\\\"2026-08-06T14:05:27.127Z\\\",\\\"updatedAt\\\":\\\"2026-08-06T14:05:27.127Z\\\",\\\"deletedAt\\\":null}\",\"cmshl8udk0000wlvoqvwerae3\",null,\"98db79e0f3ef677a69c975eab89f8a1be101ff5d87b203b8a6d3ed393f73eb4d\",\"1f603fc8f53209c700e0d69ec32c46d2f2e37098ce85b13cedd3b36de3c3b2ac\",\"2026-08-06T14:05:27.142Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 4.884937999999238,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.create",
        "status": "ok",
        "durationMs": 26.283213
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
        "durationMs": 12.621675,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 17.495393,
        "detail": {
          "userId": "cmshl8udk0000wlvoqvwerae3"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.049772,
        "detail": {
          "policy": "canCreateBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.create",
        "status": "error",
        "durationMs": 1.989426,
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
    "request": "POST /blog-posts/update\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"data\": [\n    {\n      \"id\": \"cmshl8w1n000iwlvo0gkntfcv\",\n      \"title\": \"Hello world (v2)\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmshl8w1n000iwlvo0gkntfcv\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmshl8w1n000iwlvo0gkntfcv\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmshl8udk0000wlvoqvwerae3\",\n        \"title\": \"Hello world (v2)\",\n        \"createdAt\": \"2026-08-06T14:05:27.228Z\",\n        \"updatedAt\": \"2026-08-06T14:05:27.292Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 13.271395,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 13.138284,
        "detail": {
          "userId": "cmshl8udk0000wlvoqvwerae3"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.093041,
        "detail": {
          "policy": "canUpdateAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.8216010000014649,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmshl8w1n000iwlvo0gkntfcv\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 4.454447999998592,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"title\" = $1, \"updatedAt\" = $2 WHERE (\"public\".\"BlogPost\".\"id\" = $3 AND \"public\".\"BlogPost\".\"tenantId\" = $4) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"Hello world (v2)\",\"2026-08-06T14:05:27.292Z\",\"cmshl8w1n000iwlvo0gkntfcv\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9237499999999272,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.0818449999987934,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"createdAt\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.5519569999996747,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmshl8w3t000kwlvorwbjvnpl\",\"default\",\"BlogPost\",\"update\",\"cmshl8w1n000iwlvo0gkntfcv\",\"{\\\"id\\\":\\\"cmshl8w1n000iwlvo0gkntfcv\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmshl8udk0000wlvoqvwerae3\\\",\\\"title\\\":\\\"Hello world (v2)\\\",\\\"createdAt\\\":\\\"2026-08-06T14:05:27.228Z\\\",\\\"updatedAt\\\":\\\"2026-08-06T14:05:27.292Z\\\",\\\"deletedAt\\\":null}\",\"cmshl8udk0000wlvoqvwerae3\",null,\"bc1768e69a8bca63b2a32276abc1196a8b46f0864071cca8bec22d81f063c952\",\"c6f4447c62cbfd04422ea373de763c6210dc1186eebfb656e4ae9d25039fa25d\",\"2026-08-06T14:05:27.305Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.0812669999995705,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.update",
        "status": "ok",
        "durationMs": 28.28708
      }
    ]
  },
  {
    "id": "attach-tags",
    "label": "Attacher un tag",
    "method": "POST",
    "path": "/blog-posts/update",
    "request": "POST /blog-posts/update\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"data\": [\n    {\n      \"id\": \"cmshl8w4s000lwlvo7gagi7mx\",\n      \"relations\": {\n        \"tags\": {\n          \"attach\": [\n            \"cmshl8w5g000nwlvo6m9zxa5f\"\n          ]\n        }\n      }\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmshl8w4s000lwlvo7gagi7mx\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmshl8w4s000lwlvo7gagi7mx\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmshl8udk0000wlvoqvwerae3\",\n        \"title\": \"Tagged article\",\n        \"createdAt\": \"2026-08-06T14:05:27.340Z\",\n        \"updatedAt\": \"2026-08-06T14:05:27.340Z\",\n        \"deletedAt\": null,\n        \"tags\": [\n          \"cmshl8w5g000nwlvo6m9zxa5f\"\n        ]\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 13.646555,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 13.311339,
        "detail": {
          "userId": "cmshl8udk0000wlvoqvwerae3"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.069338,
        "detail": {
          "policy": "canUpdateAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.492621000001236,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmshl8w4s000lwlvo7gagi7mx\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.5463220000001456,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmshl8w4s000lwlvo7gagi7mx\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.066093000001274,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.620950000000448,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"createdAt\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.6507480000000214,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmshl8w7j000owlvox54z24ql\",\"default\",\"BlogPost\",\"update\",\"cmshl8w4s000lwlvo7gagi7mx\",\"{\\\"id\\\":\\\"cmshl8w4s000lwlvo7gagi7mx\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmshl8udk0000wlvoqvwerae3\\\",\\\"title\\\":\\\"Tagged article\\\",\\\"createdAt\\\":\\\"2026-08-06T14:05:27.340Z\\\",\\\"updatedAt\\\":\\\"2026-08-06T14:05:27.340Z\\\",\\\"deletedAt\\\":null}\",\"cmshl8udk0000wlvoqvwerae3\",null,\"dcaa0033d09e6d514b5a6d6cde954aa3c652d404344449aace7606124943db4f\",\"2134a9bf2f1b5f221e17dd912bc59f8cb5e476cc3757f29ce08c833b8f4a9d69\",\"2026-08-06T14:05:27.439Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.345145000001139,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.697881000000052,
        "detail": {
          "sql": "INSERT INTO \"public\".\"BlogPostTag\" (\"blogPostId\",\"tagId\",\"createdAt\") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
          "params": "[\"cmshl8w4s000lwlvo7gagi7mx\",\"cmshl8w5g000nwlvo6m9zxa5f\",\"2026-08-06T14:05:27.456Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.126612000000023,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.832060000000638,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPostTag\".\"blogPostId\", \"public\".\"BlogPostTag\".\"tagId\" FROM \"public\".\"BlogPostTag\" WHERE \"public\".\"BlogPostTag\".\"blogPostId\" = $1 OFFSET $2",
          "params": "[\"cmshl8w4s000lwlvo7gagi7mx\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.update",
        "status": "ok",
        "durationMs": 44.744055
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
    "request": "POST /blog-posts/delete\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmshl8w9b000pwlvodnie2dp7\"\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmshl8w9b000pwlvodnie2dp7\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmshl8w9b000pwlvodnie2dp7\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmshl8udk0000wlvoqvwerae3\",\n        \"title\": \"Hello world\",\n        \"createdAt\": \"2026-08-06T14:05:27.503Z\",\n        \"updatedAt\": \"2026-08-06T14:05:27.557Z\",\n        \"deletedAt\": \"2026-08-06T14:05:27.554Z\"\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 11.60842,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 9.90445,
        "detail": {
          "userId": "cmshl8udk0000wlvoqvwerae3"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.09091,
        "detail": {
          "policy": "canDeleteAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.4107119999989663,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmshl8w9b000pwlvodnie2dp7\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 4.247079999999187,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"deletedAt\" = $1, \"updatedAt\" = $2 WHERE (\"public\".\"BlogPost\".\"id\" = $3 AND \"public\".\"BlogPost\".\"tenantId\" = $4) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"2026-08-06T14:05:27.554Z\",\"2026-08-06T14:05:27.557Z\",\"cmshl8w9b000pwlvodnie2dp7\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8330129999994824,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.5728579999995418,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"createdAt\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.5711300000002666,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmshl8wb4000rwlvo9uake998\",\"default\",\"BlogPost\",\"update\",\"cmshl8w9b000pwlvodnie2dp7\",\"{\\\"id\\\":\\\"cmshl8w9b000pwlvodnie2dp7\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmshl8udk0000wlvoqvwerae3\\\",\\\"title\\\":\\\"Hello world\\\",\\\"createdAt\\\":\\\"2026-08-06T14:05:27.503Z\\\",\\\"updatedAt\\\":\\\"2026-08-06T14:05:27.557Z\\\",\\\"deletedAt\\\":\\\"2026-08-06T14:05:27.554Z\\\"}\",\"cmshl8udk0000wlvoqvwerae3\",null,\"517dc82a0ff6a1350e6e7a52deb8cde132f010d2154337f0915f3d3a7dcf7e3b\",\"5c55d5770d549794072759e8a76a3654f74c621fd911dc650e23dca19a3fb5ce\",\"2026-08-06T14:05:27.568Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.9328280000008817,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.remove",
        "status": "ok",
        "durationMs": 23.676039
      }
    ]
  },
  {
    "id": "hard",
    "label": "Suppression définitive",
    "method": "POST",
    "path": "/blog-posts/delete",
    "request": "POST /blog-posts/delete\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmshl8wbx000swlvoy6ietkx9\"\n  ],\n  \"mode\": \"hard\"\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmshl8wbx000swlvoy6ietkx9\",\n      \"status\": \"ok\",\n      \"data\": null\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 10.132733,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 7.495866,
        "detail": {
          "userId": "cmshl8v120004wlvojl7vex8q"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.019377,
        "detail": {
          "policy": "canDeleteAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8054470000006404,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmshl8wbx000swlvoy6ietkx9\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 5.691168999999718,
        "detail": {
          "sql": "DELETE FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"cmshl8wbx000swlvoy6ietkx9\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 7.54289400000016,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.4755610000011075,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"createdAt\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.0972569999994448,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmshl8wdf000uwlvos8iz8va6\",\"default\",\"BlogPost\",\"delete\",\"cmshl8wbx000swlvoy6ietkx9\",\"{\\\"id\\\":\\\"cmshl8wbx000swlvoy6ietkx9\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmshl8v120004wlvojl7vex8q\\\",\\\"title\\\":\\\"Gone for good\\\",\\\"createdAt\\\":\\\"2026-08-06T14:05:27.597Z\\\",\\\"updatedAt\\\":\\\"2026-08-06T14:05:27.597Z\\\",\\\"deletedAt\\\":null}\",\"cmshl8v120004wlvojl7vex8q\",null,\"d1b31e51e79602c3f01cbc57324949c5dabd3964af588df5e7ae0c949897a2a1\",\"046a45af568644147e03ddba14943ac7d04722ad5b6f8132d93cb7235fd0a1db\",\"2026-08-06T14:05:27.651Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.6831139999994775,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.remove",
        "status": "ok",
        "durationMs": 25.324329
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
    "request": "POST /blog-posts/restore\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmshl8wed000vwlvovqexpe5v\"\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmshl8wed000vwlvovqexpe5v\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmshl8wed000vwlvovqexpe5v\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmshl8udk0000wlvoqvwerae3\",\n        \"title\": \"Hello world\",\n        \"createdAt\": \"2026-08-06T14:05:27.685Z\",\n        \"updatedAt\": \"2026-08-06T14:05:27.765Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 8.729758,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 7.629497,
        "detail": {
          "userId": "cmshl8udk0000wlvoqvwerae3"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.088268,
        "detail": {
          "policy": "canRestoreAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.0810739999997168,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmshl8wed000vwlvovqexpe5v\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.926477999999406,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"deletedAt\" = $1, \"updatedAt\" = $2 WHERE (\"public\".\"BlogPost\".\"id\" = $3 AND \"public\".\"BlogPost\".\"tenantId\" = $4) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[null,\"2026-08-06T14:05:27.765Z\",\"cmshl8wed000vwlvovqexpe5v\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.624283999999534,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.1411490000009508,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"createdAt\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.986244000001534,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmshl8wgs000ywlvophj6hsym\",\"default\",\"BlogPost\",\"update\",\"cmshl8wed000vwlvovqexpe5v\",\"{\\\"id\\\":\\\"cmshl8wed000vwlvovqexpe5v\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmshl8udk0000wlvoqvwerae3\\\",\\\"title\\\":\\\"Hello world\\\",\\\"createdAt\\\":\\\"2026-08-06T14:05:27.685Z\\\",\\\"updatedAt\\\":\\\"2026-08-06T14:05:27.765Z\\\",\\\"deletedAt\\\":null}\",\"cmshl8udk0000wlvoqvwerae3\",null,\"cbd1db6b15c2c1a39a201e1e3579b4f82d49a0ba2d87c27d9ee77a0b5acf67cc\",\"84c952aa68c6c5b37eeb81690a6198855b3ea372ba9d366d37a5fd3991428c20\",\"2026-08-06T14:05:27.772Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.464256999999634,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.restore",
        "status": "ok",
        "durationMs": 14.505057
      }
    ]
  },
  {
    "id": "restore-with-patch",
    "label": "Restaurer avec un correctif",
    "method": "POST",
    "path": "/blog-posts/restore",
    "request": "POST /blog-posts/restore\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"ids\": [\n    \"cmshl8whp000zwlvo7417evjy\"\n  ],\n  \"patch\": {\n    \"title\": \"Hello world (restored)\"\n  }\n}",
    "response": "{\n  \"data\": [\n    {\n      \"index\": 0,\n      \"id\": \"cmshl8whp000zwlvo7417evjy\",\n      \"status\": \"ok\",\n      \"data\": {\n        \"id\": \"cmshl8whp000zwlvo7417evjy\",\n        \"tenantId\": \"default\",\n        \"ownerId\": \"cmshl8udk0000wlvoqvwerae3\",\n        \"title\": \"Hello world (restored)\",\n        \"createdAt\": \"2026-08-06T14:05:27.805Z\",\n        \"updatedAt\": \"2026-08-06T14:05:28.470Z\",\n        \"deletedAt\": null\n      }\n    }\n  ],\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 7.677802,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 8.030456,
        "detail": {
          "userId": "cmshl8udk0000wlvoqvwerae3"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.020305,
        "detail": {
          "policy": "canRestoreAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9580989999994927,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"id\" = $1 AND \"public\".\"BlogPost\".\"tenantId\" = $2) LIMIT $3 OFFSET $4",
          "params": "[\"cmshl8whp000zwlvo7417evjy\",\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.213781000000381,
        "detail": {
          "sql": "UPDATE \"public\".\"BlogPost\" SET \"title\" = $1, \"deletedAt\" = $2, \"updatedAt\" = $3 WHERE (\"public\".\"BlogPost\".\"id\" = $4 AND \"public\".\"BlogPost\".\"tenantId\" = $5) RETURNING \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\"",
          "params": "[\"Hello world (restored)\",null,\"2026-08-06T14:05:28.470Z\",\"cmshl8whp000zwlvo7417evjy\",\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.8441960000000108,
        "detail": {
          "sql": "SELECT pg_advisory_xact_lock(hashtext($1))",
          "params": "[\"default\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.248277999999118,
        "detail": {
          "sql": "SELECT \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\" FROM \"public\".\"AuditLog\" WHERE \"public\".\"AuditLog\".\"tenantId\" = $1 ORDER BY \"public\".\"AuditLog\".\"createdAt\" DESC LIMIT $2 OFFSET $3",
          "params": "[\"default\",\"1\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 0.9022170000007463,
        "detail": {
          "sql": "INSERT INTO \"public\".\"AuditLog\" (\"id\",\"tenantId\",\"model\",\"operation\",\"recordId\",\"data\",\"userId\",\"impersonatedBy\",\"hash\",\"previousHash\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING \"public\".\"AuditLog\".\"id\", \"public\".\"AuditLog\".\"tenantId\", \"public\".\"AuditLog\".\"model\", \"public\".\"AuditLog\".\"operation\", \"public\".\"AuditLog\".\"recordId\", \"public\".\"AuditLog\".\"data\", \"public\".\"AuditLog\".\"userId\", \"public\".\"AuditLog\".\"impersonatedBy\", \"public\".\"AuditLog\".\"hash\", \"public\".\"AuditLog\".\"previousHash\", \"public\".\"AuditLog\".\"createdAt\"",
          "params": "[\"cmshl8x0e00p6wlvok0sxeq15\",\"default\",\"BlogPost\",\"update\",\"cmshl8whp000zwlvo7417evjy\",\"{\\\"id\\\":\\\"cmshl8whp000zwlvo7417evjy\\\",\\\"tenantId\\\":\\\"default\\\",\\\"ownerId\\\":\\\"cmshl8udk0000wlvoqvwerae3\\\",\\\"title\\\":\\\"Hello world (restored)\\\",\\\"createdAt\\\":\\\"2026-08-06T14:05:27.805Z\\\",\\\"updatedAt\\\":\\\"2026-08-06T14:05:28.470Z\\\",\\\"deletedAt\\\":null}\",\"cmshl8udk0000wlvoqvwerae3\",null,\"195df5557e93c4680adae8dfb0f0f543a6929316cbb4bc86fb693b03271898b2\",\"242349edee805867540208168b470b1e9cb5262f6ba5c12c4c0d379665744546\",\"2026-08-06T14:05:28.478Z\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 2.520473000000493,
        "detail": {
          "sql": "COMMIT",
          "params": "[]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.restore",
        "status": "ok",
        "durationMs": 15.072337
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
    "request": "POST /blog-posts/search\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\n  \"filters\": [\n    {\n      \"field\": \"id\",\n      \"value\": \"cmshl8x1200p7wlvo0i8sx6wb\"\n    }\n  ]\n}",
    "response": "{\n  \"data\": [\n    {\n      \"id\": \"cmshl8x1200p7wlvo0i8sx6wb\",\n      \"tenantId\": \"default\",\n      \"ownerId\": \"cmshl8udk0000wlvoqvwerae3\",\n      \"title\": \"Hello world\",\n      \"createdAt\": \"2026-08-06T14:05:28.502Z\",\n      \"updatedAt\": \"2026-08-06T14:05:28.502Z\",\n      \"deletedAt\": null\n    }\n  ],\n  \"meta\": {\n    \"channels\": [\n      \"blogPost\"\n    ],\n    \"page\": 1,\n    \"limit\": 15,\n    \"total\": 1,\n    \"last_page\": 1\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 7.327074,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 6.909887,
        "detail": {
          "userId": "cmshl8udk0000wlvoqvwerae3"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.02962,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 1.3227310000002035,
        "detail": {
          "sql": "SELECT \"public\".\"BlogPost\".\"id\", \"public\".\"BlogPost\".\"tenantId\", \"public\".\"BlogPost\".\"ownerId\", \"public\".\"BlogPost\".\"title\", \"public\".\"BlogPost\".\"createdAt\", \"public\".\"BlogPost\".\"updatedAt\", \"public\".\"BlogPost\".\"deletedAt\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) ORDER BY \"public\".\"BlogPost\".\"createdAt\" DESC LIMIT $4 OFFSET $5",
          "params": "[\"cmshl8udk0000wlvoqvwerae3\",\"cmshl8x1200p7wlvo0i8sx6wb\",\"default\",\"15\",\"0\"]"
        }
      },
      {
        "stage": "prisma",
        "label": "query",
        "status": "ok",
        "durationMs": 3.9457259999999224,
        "detail": {
          "sql": "SELECT COUNT(*) AS \"_count$_all\" FROM (SELECT \"public\".\"BlogPost\".\"id\" FROM \"public\".\"BlogPost\" WHERE (\"public\".\"BlogPost\".\"ownerId\" = $1 AND \"public\".\"BlogPost\".\"deletedAt\" IS NULL AND \"public\".\"BlogPost\".\"id\" = $2 AND \"public\".\"BlogPost\".\"tenantId\" = $3) OFFSET $4) AS \"sub\"",
          "params": "[\"cmshl8udk0000wlvoqvwerae3\",\"cmshl8x1200p7wlvo0i8sx6wb\",\"default\",\"0\"]"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.search",
        "status": "ok",
        "durationMs": 4.815462
      }
    ]
  },
  {
    "id": "describe",
    "label": "Contrat de la ressource",
    "method": "GET",
    "path": "/blog-posts/describe",
    "request": "GET /blog-posts/describe\nAuthorization: Bearer <token>",
    "response": "{\n  \"data\": {\n    \"fields\": [\n      {\n        \"name\": \"title\",\n        \"type\": \"string\",\n        \"optional\": false\n      }\n    ],\n    \"sorts\": [\n      \"createdAt\"\n    ],\n    \"filters\": [\n      \"id\",\n      \"title\"\n    ],\n    \"selects\": [\n      \"id\",\n      \"ownerId\",\n      \"title\",\n      \"createdAt\",\n      \"updatedAt\",\n      \"deletedAt\"\n    ],\n    \"includes\": {\n      \"notes\": {\n        \"type\": \"hasMany\",\n        \"foreignKey\": \"blogPostId\",\n        \"childDelegate\": \"blogPostNote\",\n        \"filters\": [\n          \"body\"\n        ],\n        \"sorts\": [\n          \"createdAt\"\n        ],\n        \"selects\": [\n          \"id\",\n          \"body\",\n          \"rating\",\n          \"createdAt\"\n        ]\n      },\n      \"comments\": {\n        \"type\": \"morphMany\",\n        \"foreignKey\": \"commentableId\",\n        \"discriminator\": \"commentableType\",\n        \"discriminatorValue\": \"BlogPost\",\n        \"childDelegate\": \"comment\",\n        \"filters\": [\n          \"body\"\n        ],\n        \"sorts\": [\n          \"createdAt\"\n        ],\n        \"selects\": [\n          \"id\",\n          \"body\",\n          \"createdAt\"\n        ]\n      }\n    },\n    \"aggregates\": {\n      \"notes\": {\n        \"type\": \"hasMany\",\n        \"foreignKey\": \"blogPostId\",\n        \"childDelegate\": \"blogPostNote\",\n        \"filters\": [\n          \"body\"\n        ],\n        \"fields\": [\n          \"rating\"\n        ]\n      },\n      \"comments\": {\n        \"type\": \"morphMany\",\n        \"foreignKey\": \"commentableId\",\n        \"discriminator\": \"commentableType\",\n        \"discriminatorValue\": \"BlogPost\",\n        \"childDelegate\": \"comment\",\n        \"filters\": [\n          \"body\"\n        ],\n        \"fields\": []\n      }\n    },\n    \"limits\": [\n      10,\n      15,\n      20\n    ],\n    \"defaultLimit\": 15,\n    \"rules\": {\n      \"create\": {\n        \"$schema\": \"https://json-schema.org/draft/2020-12/schema\",\n        \"type\": \"object\",\n        \"properties\": {\n          \"title\": {\n            \"type\": \"string\",\n            \"minLength\": 1,\n            \"maxLength\": 255\n          }\n        },\n        \"required\": [\n          \"title\"\n        ],\n        \"additionalProperties\": false\n      },\n      \"update\": {\n        \"$schema\": \"https://json-schema.org/draft/2020-12/schema\",\n        \"type\": \"object\",\n        \"properties\": {\n          \"title\": {\n            \"type\": \"string\",\n            \"minLength\": 1,\n            \"maxLength\": 255\n          }\n        },\n        \"additionalProperties\": false\n      }\n    }\n  },\n  \"messages\": []\n}",
    "flow": [
      {
        "stage": "middleware",
        "label": "tenant resolution",
        "status": "ok",
        "durationMs": 9.757249,
        "detail": {
          "tenantId": "default"
        }
      },
      {
        "stage": "guard",
        "label": "session",
        "status": "ok",
        "durationMs": 20.612677,
        "detail": {
          "userId": "cmshl8udk0000wlvoqvwerae3"
        }
      },
      {
        "stage": "guard",
        "label": "capability",
        "status": "ok",
        "durationMs": 0.023799,
        "detail": {
          "policy": "canViewAnyBlogPost",
          "scope": "own"
        }
      },
      {
        "stage": "controller",
        "label": "BlogPostController.describe",
        "status": "ok",
        "durationMs": 0.105329
      }
    ]
  }
];

export const resourceCode = {
  "search": "@Post('search')\n  @HttpCode(200)\n  @Capability(canViewAnyBlogPost)\n  async search(\n    @Req() req: RequestWithUser,\n    @Body(new ZodValidationPipe(searchRequestSchema)) body: SearchRequestBody,\n  ) {\n    const query = parseSearchRequest(body, BLOG_POST_CONTRACT);\n    const subject = subjectOf(req.user);\n\n    if (query.withTrashed || query.onlyTrashed) {\n      const trashedDecision = canListTrashedBlogPost(subject);\n\n      if (!trashedDecision.allowed) {\n        throw new CapabilityForbiddenException(trashedDecision);\n      }\n    }\n\n    const { records, total, matches } = await this.blogPosts.search(\n      subject,\n      query,\n    );\n    const capabilities = body.capabilities ?? [];\n    const select = query.select;\n    const project = (view: Record<string, unknown>) =>\n      select\n        ? Object.fromEntries(\n            Object.entries(view).filter(([key]) => key in select),\n          )\n        : view;\n    const meta = {\n      channels: [BLOG_POST_SIGNAL_CHANNEL],\n      page: query.page,\n      limit: query.limit,\n      total,\n      last_page: Math.max(1, Math.ceil(total / query.limit)),\n      ...(matches\n        ? {\n            search: { matchLimit: matches.limit, truncated: matches.truncated },\n          }\n        : {}),\n    };\n\n    // A truncated match set makes total a floor rather than a count, so the\n    // response says which one it is instead of leaving the caller to trust a\n    // number that is quietly wrong.\n    const messages = matches?.truncated\n      ? [\n          `Only the first ${matches.limit} full-text matches were counted, and more exist. The totals below are a floor, not a count -- narrow the search term to see the rest.`,\n        ]\n      : [];\n\n    if (capabilities.length === 0) {\n      return ok(\n        records.map((record) =>\n          withIncludesAndAggregates(\n            project(toBlogPostView(record)),\n            record,\n            query,\n          ),\n        ),\n        meta,\n        messages,\n      );\n    }\n\n    return ok(\n      records.map((record) => {\n        const resolved = this.policy.recordCapabilities(subject, record);\n        return {\n          ...withIncludesAndAggregates(\n            project(toBlogPostView(record)),\n            record,\n            query,\n          ),\n          capabilities: Object.fromEntries(\n            Object.entries(resolved).filter(([key]) =>\n              capabilities.includes(key),\n            ),\n          ),\n        };\n      }),\n      {\n        ...meta,\n        capabilities: this.policy.metaCapabilities(subject),\n      },\n      messages,\n    );\n  }",
  "create": "@Post('create')\n  @Capability(canCreateBlogPost)\n  async create(\n    @Req() req: RequestWithUser,\n    @Body(new ZodValidationPipe(createBlogPostRequestSchema))\n    body: CreateBlogPostRequestBody,\n  ) {\n    const subject = subjectOf(req.user);\n    const results = [];\n\n    for (const [index, item] of body.data.entries()) {\n      try {\n        const created = await this.blogPosts.create(subject, item);\n        results.push({\n          index,\n          status: 'ok' as const,\n          data: toBlogPostView(created),\n        });\n      } catch (error) {\n        results.push({\n          index,\n          status: 'error' as const,\n          error: resolveDomainError(error),\n        });\n      }\n    }\n\n    return ok(results);\n  }",
  "update": "@Post('update')\n  @Capability(canUpdateAnyBlogPost)\n  async update(\n    @Req() req: RequestWithUser,\n    @Body(new ZodValidationPipe(updateBlogPostRequestSchema))\n    body: UpdateBlogPostRequestBody,\n  ) {\n    const subject = subjectOf(req.user);\n    const loaded = await this.loadAndAuthorize(\n      body.data.map((item) => item.id),\n      subject,\n      (s, record) => canUpdateBlogPost(s, record as never),\n    );\n\n    const results = [];\n\n    for (const [index, entry] of loaded.entries()) {\n      if (!entry.ok) {\n        results.push({\n          index,\n          id: entry.id,\n          status: 'error' as const,\n          error: entry.error,\n        });\n        continue;\n      }\n\n      const { id: _id, relations, ...data } = body.data[index]!;\n\n      try {\n        const updated = await this.blogPosts.update(entry.record, data);\n        const relationResults: Record<string, string[]> = {};\n\n        if (relations?.tags) {\n          const { attach, detach, sync } = relations.tags;\n\n          if ((attach && attach.length > 0) || sync) {\n            const decision = canAttachTagsToBlogPost(subject, entry.record);\n            if (!decision.allowed) {\n              throw new CapabilityForbiddenException(decision);\n            }\n          }\n\n          if ((detach && detach.length > 0) || sync) {\n            const decision = canDetachTagsFromBlogPost(subject, entry.record);\n            if (!decision.allowed) {\n              throw new CapabilityForbiddenException(decision);\n            }\n          }\n\n          relationResults.tags = await this.blogPosts.syncTags(\n            entry.record,\n            relations.tags,\n          );\n        }\n\n        results.push({\n          index,\n          id: entry.id,\n          status: 'ok' as const,\n          data: { ...toBlogPostView(updated), ...relationResults },\n        });\n      } catch (error) {\n        results.push({\n          index,\n          id: entry.id,\n          status: 'error' as const,\n          error: resolveDomainError(error),\n        });\n      }\n    }\n\n    return ok(results);\n  }",
  "delete": "@Post('delete')\n  @Capability(canDeleteAnyBlogPost)\n  async remove(\n    @Req() req: RequestWithUser,\n    @Body(new ZodValidationPipe(deleteBlogPostRequestSchema))\n    body: DeleteBlogPostRequestBody,\n  ) {\n    const subject = subjectOf(req.user);\n    const loaded = await this.loadAndAuthorize(body.ids, subject, (s, record) =>\n      canDeleteBlogPost(s, record as never),\n    );\n\n    if (body.mode === 'hard') {\n      const hardDecision = canHardDeleteBlogPost(subject);\n\n      if (!hardDecision.allowed) {\n        throw new CapabilityForbiddenException(hardDecision);\n      }\n    }\n\n    const results = [];\n\n    for (const [index, entry] of loaded.entries()) {\n      if (!entry.ok) {\n        results.push({\n          index,\n          id: entry.id,\n          status: 'error' as const,\n          error: entry.error,\n        });\n        continue;\n      }\n\n      try {\n        if (body.mode === 'hard') {\n          await this.blogPosts.hardDelete(entry.record);\n          results.push({\n            index,\n            id: entry.id,\n            status: 'ok' as const,\n            data: null,\n          });\n        } else {\n          const removed = await this.blogPosts.softDelete(entry.record);\n          results.push({\n            index,\n            id: entry.id,\n            status: 'ok' as const,\n            data: toBlogPostView(removed),\n          });\n        }\n      } catch (error) {\n        results.push({\n          index,\n          id: entry.id,\n          status: 'error' as const,\n          error: resolveDomainError(error),\n        });\n      }\n    }\n\n    return ok(results);\n  }",
  "restore": "@Post('restore')\n  @Capability(canRestoreAnyBlogPost)\n  async restore(\n    @Req() req: RequestWithUser,\n    @Body(new ZodValidationPipe(restoreBlogPostRequestSchema))\n    body: RestoreBlogPostRequestBody,\n  ) {\n    const subject = subjectOf(req.user);\n    const loaded = await this.loadAndAuthorize(body.ids, subject, (s, record) =>\n      canRestoreBlogPost(s, record as never),\n    );\n\n    const results = [];\n\n    for (const [index, entry] of loaded.entries()) {\n      if (!entry.ok) {\n        results.push({\n          index,\n          id: entry.id,\n          status: 'error' as const,\n          error: entry.error,\n        });\n        continue;\n      }\n\n      try {\n        if (!entry.record.deletedAt) {\n          throw new AlreadyRestoredException('blog-post');\n        }\n\n        const restored = await this.blogPosts.restore(entry.record, body.patch);\n        results.push({\n          index,\n          id: entry.id,\n          status: 'ok' as const,\n          data: toBlogPostView(restored),\n        });\n      } catch (error) {\n        results.push({\n          index,\n          id: entry.id,\n          status: 'error' as const,\n          error: resolveDomainError(error),\n        });\n      }\n    }\n\n    return ok(results);\n  }",
  "describe": "@Get('describe')\n  @Capability(canViewAnyBlogPost)\n  describe() {\n    return ok(BLOG_POST_DESCRIBE);\n  }"
};
