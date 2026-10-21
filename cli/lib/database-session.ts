import { Client } from 'pg';
import { DatabaseWorkflowError } from './database';
import type { SqlClient } from './database';

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new DatabaseWorkflowError(
      'DATABASE_URL is not set. Put it in .env or export it before running this command.',
    );
  }

  return url;
}

export async function withClient<T>(
  connectionString: string,
  run: (client: SqlClient) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    return await run(client);
  } finally {
    await client.end();
  }
}
