import type { DataProvider } from '@refinedev/core';
import { apiFetch } from './api-fetch';
import { API_URL } from './config';

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
