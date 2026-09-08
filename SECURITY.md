# Security policy

## Reporting a vulnerability

Report it privately through GitHub: **Security → Report a vulnerability** on
[this repository](https://github.com/techmefr/HeryJs/security/advisories/new).
That opens a private advisory only you and the maintainer can read. Please do
not open a public issue for a vulnerability.

Include what you need to make it reproducible: the version, the command or
route involved, and what you expected instead. A proof of concept helps and is
never required.

This is a single-maintainer project. You should get a first answer within a
week; if a report is confirmed, the advisory is where the fix and the release
are tracked, and you are credited unless you ask otherwise.

## What is in scope

- The CLI and what it generates: `hery new`, `hery generate`, `hery install`,
  and the code they write into a project.
- The kernel under `src/technical/`: authentication, capabilities, the tenant
  boundary, row-level security, the guards every generated route sits behind.
- The official modules under `packages/`.

Out of scope: a project's own code once it has been generated, dependencies
(report those upstream), and anything requiring an attacker to already control
the machine running the CLI.

## A fix does not travel backwards

HeryJs generates code once and disappears — a generated project owns its files
and is never re-synced. So a fix released here reaches new projects, and
reaches an existing one only when its developer applies it by hand. A security
advisory therefore always says which generated file is affected and what the
corrected version of it looks like, not only which release fixes the generator.

## Supported versions

Before 1.0, only the latest published version is supported.
