import { devEnvironmentsOf } from './dev-environments';
import { buildPublicSchema, buildServerSchema } from './env-schema';
import { heryConfig } from './hery-config';

export function parseEnv(source: NodeJS.ProcessEnv) {
  const result = buildServerSchema(
    source.NODE_ENV,
    devEnvironmentsOf(heryConfig),
  ).safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const missing = missingPasskeySettings(result.data);

  if (missing.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${missing
        .map((name) => `  ${name}: required when AUTH_PASSKEY_ENABLED is true`)
        .join('\n')}`,
    );
  }

  return result.data;
}

function missingPasskeySettings(data: {
  AUTH_PASSKEY_ENABLED: boolean;
  AUTH_PASSKEY_RP_ID?: string;
  AUTH_PASSKEY_ORIGIN?: string;
}): string[] {
  if (!data.AUTH_PASSKEY_ENABLED) {
    return [];
  }

  const required: Array<[string, string | undefined]> = [
    ['AUTH_PASSKEY_RP_ID', data.AUTH_PASSKEY_RP_ID],
    ['AUTH_PASSKEY_ORIGIN', data.AUTH_PASSKEY_ORIGIN],
  ];

  return required.filter(([, value]) => !value).map(([name]) => name);
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
