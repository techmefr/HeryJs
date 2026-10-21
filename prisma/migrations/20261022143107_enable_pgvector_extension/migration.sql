-- pgvector backs the `vector` blueprint field and the similarity search mode.
-- The extension has to exist before any migration creates a `vector(N)` column,
-- and it is installed once per database rather than per resource, so it lives
-- here. The postgres image must ship it: docker-compose.yml and CI use
-- pgvector/pgvector for that reason.
CREATE EXTENSION IF NOT EXISTS vector;
