/**
 * Runs before every test file, inside its worker. Points the file at the
 * database and the Redis keyspace its worker owns, so nothing a spec writes can
 * be read, or broken, by a spec running beside it.
 *
 * It must be a setup file rather than part of the global setup: jest gives each
 * test file its own copy of process.env, and a worker's id only exists once the
 * worker does. Setting the variables here, before the spec imports `env`, is
 * early enough -- the spec's own module graph has not been loaded yet.
 *
 * Does nothing under JEST_SHARED_DB=true, which is the way back to one shared
 * database.
 */
import {
  BASE_URL_VARIABLE,
  databaseNameOf,
  isSharedDatabase,
  withDatabase,
  withRedisDatabase,
  workerDatabaseName,
} from './parallel-db';

const workerId = Number(process.env.JEST_WORKER_ID);
const baseUrl = process.env[BASE_URL_VARIABLE];

if (!isSharedDatabase() && baseUrl && Number.isInteger(workerId)) {
  process.env.DATABASE_URL = withDatabase(
    baseUrl,
    workerDatabaseName(databaseNameOf(baseUrl), workerId),
  );

  if (process.env.REDIS_URL) {
    process.env.REDIS_URL = withRedisDatabase(process.env.REDIS_URL, workerId);
  }
}
