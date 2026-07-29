import { authToken } from './auth-provider';
import { API_URL } from './config';

export async function apiFetch(path: string, init?: RequestInit) {
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
