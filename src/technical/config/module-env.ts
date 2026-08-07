import { z } from 'zod';

/**
 * A module is opt-in, so the kernel's schema in env-schema.ts cannot declare
 * variables for a module that may not be installed. Each module declares its
 * own schema and parses it through here instead, once, when it is imported --
 * so a misspelled variable name fails at boot with the module's name on it,
 * rather than degrading in silence to a development default.
 */
export function parseModuleEnv<TShape extends z.ZodRawShape>(
  moduleName: string,
  shape: TShape,
): z.infer<z.ZodObject<TShape>> {
  const result = z.object(shape).safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Invalid environment configuration for the ${moduleName} module:\n${issues}`,
    );
  }

  return result.data;
}

/**
 * A value that ships with a working development default and is refused once
 * NODE_ENV is production -- the same contract the kernel's own two secrets
 * answer to, because a credential printed in a public repository is not a
 * credential and a service URL pointing at localhost is not a service.
 */
export function devOnlyDefault(variable: string, devValue: string) {
  return z
    .string()
    .min(1)
    .default(devValue)
    .refine(
      (value) => value !== devValue || process.env.NODE_ENV !== 'production',
      {
        message: `is still the development default (${devValue}); set ${variable} before deploying`,
      },
    );
}
