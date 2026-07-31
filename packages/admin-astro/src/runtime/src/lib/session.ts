const TOKEN_KEY = 'heryjs-admin-token';

export function token(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(value: string): void {
  localStorage.setItem(TOKEN_KEY, value);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
