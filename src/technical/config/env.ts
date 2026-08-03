import { buildPublicSchema, buildServerSchema } from './env-schema';

export function parseEnv(source: NodeJS.ProcessEnv) {
  const result = buildServerSchema(source.NODE_ENV).safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}

export function parsePublicEnv(source: NodeJS.ProcessEnv) {
  const result = buildPublicSchema().safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid public environment configuration:\n${issues}`);
  }

  return result.data;
}

export const env = parseEnv(process.env);
export const publicEnv = parsePublicEnv(process.env);
