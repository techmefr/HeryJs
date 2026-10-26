#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

mode=--dry-run
if [ "${1:-}" = "--yes" ]; then
  mode=
elif [ -n "${1:-}" ]; then
  echo "usage: $0 [--yes]" >&2
  exit 2
fi

if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "Not on main." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "The working tree is not clean." >&2
  exit 1
fi

git fetch --quiet origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "main is not origin/main." >&2
  exit 1
fi

if [ -z "$mode" ]; then
  npm whoami > /dev/null || { echo "Run npm login first." >&2; exit 1; }
fi

pnpm install --frozen-lockfile
pnpm run db:generate
pnpm run build:core

restore() {
  git checkout -- package.json 'packages/*/package.json'
}
trap restore EXIT

node -e '
  const fs = require("node:fs");
  const files = ["package.json", ...fs.readdirSync("packages").map((dir) => `packages/${dir}/package.json`)];
  for (const file of files.filter((file) => fs.existsSync(file))) {
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    if (manifest.publishConfig) delete manifest.publishConfig.provenance;
    fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  }
'

pnpm -r publish --access public --no-git-checks $mode

if [ -n "$mode" ]; then
  echo "Dry run only. Run $0 --yes to publish."
fi
