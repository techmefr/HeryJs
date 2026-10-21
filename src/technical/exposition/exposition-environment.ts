import type { ExposedEnvironment, RegisteredAction } from './exposition.types';

export function currentEnvironment(): ExposedEnvironment {
  const raw = process.env.NODE_ENV;
  return raw === 'production' || raw === 'test' ? raw : 'development';
}

export function isAllowedHere(action: RegisteredAction): boolean {
  return (
    !action.environments || action.environments.includes(currentEnvironment())
  );
}
