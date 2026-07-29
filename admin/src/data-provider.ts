import type { DataProvider } from '@refinedev/core';
import { API_URL } from './config';
import { authToken } from './auth-provider';

async function apiFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken()}`,
      'x-tenant-id': 'default',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const error = new Error(`Request to ${path} failed`) as Error & {
      statusCode?: number;
    };
    error.statusCode = response.status;
    throw error;
  }

  return response.json();
}

export const dataProvider: DataProvider = {
  getApiUrl: () => API_URL,

  getList: async ({ resource }) => {
    const body = await apiFetch(`/${resource}`);
    return { data: body.data, total: body.data.length };
  },

  getOne: async ({ resource, id }) => {
    const body = await apiFetch(`/${resource}/${id}`);
    return { data: body.data };
  },

  create: async () => {
    throw new Error('create is not supported for feature-flags');
  },

  update: async ({ resource, id, variables }) => {
    const body = await apiFetch(`/${resource}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(variables),
    });
    return { data: body.data };
  },

  deleteOne: async () => {
    throw new Error('delete is not supported for feature-flags');
  },
};
