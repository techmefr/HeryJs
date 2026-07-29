import type { AuthProvider } from '@refinedev/core';

import { API_URL } from './config';

const TOKEN_KEY = 'heryjs-admin-token';

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: { name: 'LoginError', message: 'Invalid email or password' },
      };
    }

    const body = await response.json();
    localStorage.setItem(TOKEN_KEY, body.data.token);
    return { success: true, redirectTo: '/' };
  },

  logout: async () => {
    localStorage.removeItem(TOKEN_KEY);
    return { success: true, redirectTo: '/login' };
  },

  check: async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    return token
      ? { authenticated: true }
      : { authenticated: false, redirectTo: '/login' };
  },

  onError: async (error) => {
    if (error?.status === 401) {
      return { logout: true, redirectTo: '/login' };
    }
    return { error };
  },

  getIdentity: async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? { id: 'current-user' } : null;
  },
};

export function authToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
