/**
 * The environment a child process starts with: everything this process has,
 * plus the overrides. A child such as pg_dump needs PATH, locale and whatever
 * the operator's tooling put there, so what it inherits cannot be a validated
 * schema the way the application's own settings are. Reading it whole in one
 * named place keeps that out of the rest of the code, which is what
 * no-raw-process-env exists to enforce.
 */
export function childEnv(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return { ...process.env, ...overrides };
}
