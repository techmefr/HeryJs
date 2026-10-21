---
title: Workflow
description: Declare a state machine for a resource's status in the blueprint and get a transition route, one capability per transition and typed refusals.
---

A `status` column that any update can overwrite is not a lifecycle. Declare the machine in the blueprint and the status moves only along edges you wrote down, by people the policy allows, leaving a trace each time.

```yaml
name: Snippet

fields:
  - name: title
    type: string
  - name: summary
    type: string
    optional: true

workflow:
  initial: draft
  transitions:
    - name: publish
      from: [draft]
      to: published
      requires: [summary]
    - name: archive
      from: [draft, published]
      to: archived
      permission: all
    - name: reopen
      from: [archived]
      to: draft
```

Off unless declared. `workflow` only applies to a routed resource.

## What you declare

| Key | Meaning |
| --- | --- |
| `field` | The state column, `status` by default. It is added for you: declaring a field of that name is refused. |
| `initial` | The state a new record starts in. It is the column's default. |
| `transitions[].name` | The name a client sends. It must not collide with a route or capability the resource already has (`update`, `delete`, `restore`, ...). |
| `transitions[].from` | The states it may leave from. |
| `transitions[].to` | The state it arrives in. |
| `transitions[].permission` | `own`, `team`, `all` or `none`, default `own`. Resolved per record, like the four presets. |
| `transitions[].requires` | Declared fields that must hold a value before the transition runs. |

## What it generates

- a `status` column, `@default("<initial>")`, on the record view and in the selectable fields. The create and update schemas do not have it: a client that sends it has it dropped, so the only way to change it is the route below.
- `POST /<resource>/transition`, a batch route like `update`: `{ data: [{ id, transition }], atomic }`. The outer gate is the broad view-level pass; each entry is then checked against its own transition's capability.
- one capability per transition (`canPublishSnippet`, ...), never an alias of `update`: being allowed to edit a record does not make "publish" yours to fire. Each shows up in a record's `capabilities` under the transition's name when the search asks for it.
- `workflow: { field, initial, states, transitions }` in `GET /<resource>/describe`, the route and a `<Name>Transition` union in the OpenAPI document and the typed client.
- a generated suite block proving the transition, the refusal of an undeclared name, an illegal move, an unmet guard, a caller the capability does not cover, and that the state column cannot be written through update.

## Refusals

| Case | Status | Key |
| --- | --- | --- |
| the record is not in a state the transition leaves from | `409` | `<resource>.illegalTransition` |
| a `requires` field is empty | `422` | `<resource>.transitionGuard` |
| the caller's capability for that transition is denied | `403` | `capability.forbidden` |
| the transition name was never declared | `400` | validation error |

The state is checked before the guard, so a record in the wrong state is never reported as missing a field. A blank string counts as empty; `0` and `false` do not.

The write repeats the state it read in its `where`, so two callers firing from the same state cannot both succeed: the loser gets the same `409`.

## What a transition leaves behind

In the same transaction as the new state:

- one audit entry, operation `transition`, with `{ transition, from, to }` as data and the acting user (and impersonator, if any), in the hash-chained audit log;
- one outbox message named `workflow.transitioned` with the model, record id, transition, both states and the user. Anything that consumes the [outbox](../outbox/) (webhooks, handlers) can react to it; if the transaction fails, neither exists.

On a versioned resource the transition also increments `version`.

## From the admin

The resource page reads `workflow` from `/describe`. Each row shows a button for every transition leaving the state it is in, enabled exactly when the row's capability for that transition is allowed. A refusal from the API (illegal state, unmet guard) is shown as the message. Nothing about the machine is encoded in the admin.

## Migration

The column is added by `hery generate` to the schema. A project that already has the table needs a migration:

```sql
ALTER TABLE "Snippet" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft';
```

## Limits

- a transition is a single hop; there is no parallel state, no timer and no automatic transition;
- GraphQL and MCP expose the state on reads but have no transition mutation: use the REST route;
- guards check that fields hold a value, not arbitrary conditions. A rule across several fields belongs in the DTO's refinement.
