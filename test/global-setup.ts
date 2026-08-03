/**
 * jest builds each test file's process.env as its own copy, and
 * `process.loadEnvFile` writes into the real process -- a `setupFiles` entry
 * runs after that copy is already built, so the file would load too late for
 * any test to see it. globalSetup runs once in jest's own process before any
 * test environment exists, which is early enough.
 *
 * The relative import matters here: this file is loaded directly by jest's
 * runner rather than through the sandboxed module graph that moduleNameMapper
 * covers, so the `#technical/...` subpath falls back to package.json's
 * "imports" field and its default condition, which points at a `dist/` build
 * that does not exist in development.
 */
import '../src/technical/config/load-env';

export default function loadEnvBeforeTests(): void {}
