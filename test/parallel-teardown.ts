/**
 * Drops the per-worker databases. The migrated template stays, because building
 * it is the slow part and its name already says which migrations it holds.
 */
import { Client } from 'pg';
import {
  BASE_URL_VARIABLE,
  WORKER_COUNT_VARIABLE,
  databaseNameOf,
  withDatabase,
  workerDatabaseName,
} from './parallel-db';

export default async function dropWorkerDatabases(): Promise<void> {
  const baseUrl = process.env[BASE_URL_VARIABLE];
  const workers = Number(process.env[WORKER_COUNT_VARIABLE]);

  if (!baseUrl || !Number.isInteger(workers)) {
    return;
  }

  const client = new Client({
    connectionString: withDatabase(baseUrl, 'postgres'),
  });

  await client.connect();

  try {
    for (let worker = 1; worker <= workers; worker += 1) {
      const name = workerDatabaseName(databaseNameOf(baseUrl), worker);

      await client.query(
        `DROP DATABASE IF EXISTS "${name.replaceAll('"', '""')}" WITH (FORCE)`,
      );
    }
  } finally {
    await client.end();
  }
}
