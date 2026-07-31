---
title: Overview
description: What every generated endpoint shares — the six routes, the envelope, and where to authenticate — before the per-endpoint pages get specific.
---

Every resource `hery generate` produces exposes the same six routes, shaped by the same envelope. Once you have read one resource's endpoints, you have effectively read all of them — the only things that change from one resource to the next are the URL segment and the fields inside `data`.

The pages in this section walk through a real one, `Workout`, end to end. Each page covers one endpoint: what to send, and exactly what comes back.

## The six routes

| Method   | Path                    | What it does                                               | Documented in                                    |
| -------- | ----------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `GET`    | `/workouts`             | List, with search, sort, filter and pagination             | [Search](/guides/endpoints/search/)              |
| `GET`    | `/workouts/describe`    | The resource's contract — fields, limits, validation rules | [Details](/guides/endpoints/details/)            |
| `GET`    | `/workouts/:id`         | Read one record                                            | [Details](/guides/endpoints/details/)            |
| `POST`   | `/workouts`             | Create                                                     | [Create and update](/guides/endpoints/mutate/)   |
| `PATCH`  | `/workouts/:id`         | Update                                                     | [Create and update](/guides/endpoints/mutate/)   |
| `DELETE` | `/workouts/:id`         | Soft-delete                                                | [Delete and restore](/guides/endpoints/destroy/) |
| `POST`   | `/workouts/:id/restore` | Undo a soft-delete                                         | [Delete and restore](/guides/endpoints/destroy/) |

Every one of them requires a session — send the bearer token you got from `/auth/login` or `/auth/register` in an `Authorization: Bearer <token>` header. See [Authentication](/guides/authentication/) for how to get one.

## The envelope

Three keys, always: `data`, `meta` (only when there is something to say about the response — search results carry realtime channel names, for instance), `messages` (a list of strings for a human — often empty, always present, safe to render unconditionally). This is the whole envelope; there is no fourth shape hiding somewhere else.

```json
{
  "data": { "id": "cly8x7g9k0000abc123def456", "title": "Leg day" },
  "messages": []
}
```

## When something goes wrong

Every error, from every route, comes back the same way — see [Errors and responses](/guides/errors-and-responses/) for the full table of status/key pairs. The one rule worth keeping in mind while building a UI: **the `key` is what you branch on in code, the `message` is what you show a human, and neither ever changes shape** between resources or between routes.

If a response looks wrong and you can't tell why — a 403 you didn't expect, a filter that silently returns nothing — see [Debugging with the pipeline trace](/guides/debugging/), which is aimed at whoever owns the backend for exactly this conversation.
