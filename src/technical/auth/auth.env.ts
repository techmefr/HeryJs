import { env } from '#technical/config/env';

/**
 * Auth reads the kernel's single validated environment rather than parsing its
 * own slice: one parse at boot means a bad AUTH_* value stops the app where
 * every other bad value does, instead of the first time something happens to
 * import auth.
 */
export type AuthEnv = typeof env;

export const authEnv: AuthEnv = env;
