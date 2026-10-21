import type { DescribedController } from './api';
import type { ResourceDescription, ResourceRow } from './resource';

export const mockDescription: ResourceDescription = {
  version: 1,
  fields: [
    { name: 'title', type: 'string', optional: false },
    { name: 'views', type: 'int', optional: true },
    { name: 'isPublished', type: 'boolean', optional: true },
    { name: 'publishedAt', type: 'datetime', optional: true },
  ],
  sorts: ['createdAt', 'title'],
  filters: ['id', 'title', 'views', 'isPublished', 'publishedAt'],
  selects: ['id', 'title', 'views'],
  includes: { notes: { childDelegate: 'blogPostNote' } },
  limits: [10, 15],
  defaultLimit: 15,
  paginated: true,
  softDeletes: true,
  relations: ['tags'],
  rules: {
    create: {
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 255 },
        views: {
          type: 'integer',
          minimum: -9007199254740991,
          maximum: 9007199254740991,
        },
        isPublished: { type: 'boolean' },
        publishedAt: {},
      },
      required: ['title'],
    },
    update: {
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 255 },
        views: {
          type: 'integer',
          minimum: -9007199254740991,
          maximum: 9007199254740991,
        },
        isPublished: { type: 'boolean' },
        publishedAt: {},
      },
    },
  },
};

export const mockDecisions = {
  update: { allowed: true, scope: 'own' },
  delete: { allowed: true, scope: 'own' },
  restore: { allowed: true, scope: 'own' },
  attachTags: { allowed: true, scope: 'own' },
  detachTags: { allowed: false },
};

export function mockRow(
  id: string,
  title: string,
  capabilities: ResourceRow['capabilities'] = mockDecisions,
): ResourceRow {
  return { id, title, views: 3, capabilities };
}

export const mockControllers: DescribedController[] = [
  {
    name: 'BlogPostController',
    basePath: '/blog-posts',
    routes: [
      { method: 'POST', path: '/search', handler: 'search' },
      { method: 'GET', path: '/describe', handler: 'describe' },
      { method: 'POST', path: '/create', handler: 'create' },
      { method: 'POST', path: '/update', handler: 'update' },
      { method: 'POST', path: '/delete', handler: 'remove' },
      { method: 'POST', path: '/:id/notes/search', handler: 'searchNotes' },
    ],
  },
  {
    name: 'HealthController',
    basePath: '/health',
    routes: [{ method: 'GET', path: '/', handler: 'check' }],
  },
];
