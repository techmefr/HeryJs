-- The role the application connects as (DATABASE_URL). It owns nothing and
-- can neither bypass row-level security nor change the schema: migrations run
-- as the owner (DATABASE_MIGRATION_URL), which is whoever runs this file.
-- Mounted into docker-entrypoint-initdb.d by docker-compose.yml, and safe to
-- run again by hand: psql "$DATABASE_MIGRATION_URL" -f scripts/postgres/app-role.sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heryjs_app') THEN
    CREATE ROLE heryjs_app LOGIN PASSWORD 'heryjs_app';
  END IF;
END
$$;

ALTER ROLE heryjs_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA public TO heryjs_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO heryjs_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO heryjs_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO heryjs_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO heryjs_app;

-- Every database created later (a test worker, hery db:branch) starts as a
-- copy of template1, so it inherits the same grants.
\connect template1

GRANT USAGE ON SCHEMA public TO heryjs_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO heryjs_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO heryjs_app;
