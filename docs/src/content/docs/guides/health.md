---
title: Health checks
description: "Liveness and readiness are different questions. A registry any module can add a check to answers each of them separately."
---

An orchestrator asks a process two unrelated things. "Is it wedged, should I
kill it?" is **liveness**. "Can I send it traffic right now?" is **readiness**.
Answering both from one list is how a pod gets restarted in a loop because
Postgres blinked: the process was fine, and killing it fixed nothing.

## Three routes

| Route | Caller | Answers |
| --- | --- | --- |
| `GET /health/live` | anyone | `{ "status": "ok" }`, always, while the process serves requests |
| `GET /health/ready` | anyone | `{ "status": "ok" }` or `{ "status": "error" }` with a 503 |
| `GET /health` | an admin session or API key | the full readiness report, every check by name with its failure message and duration |

The two probes are public on purpose and say nothing but ok or error: a
database error message can name a host or a user. The detail stays on the
authenticated route, the same way `/metrics` does.

```sh
curl -i localhost:3000/health/ready
```

A Kubernetes pod points its probes at them:

```yaml
livenessProbe:
  httpGet: { path: /health/live, port: 3000 }
readinessProbe:
  httpGet: { path: /health/ready, port: 3000 }
```

## What ships

| Check | Probe | What it does |
| --- | --- | --- |
| `process` | liveness | nothing, which is the point: it answers if the event loop does |
| `database` | readiness | `SELECT 1` |
| `cache` | readiness | `PING` on the cache connection |
| `queue` | readiness | reads the default queue's counts, which needs the queue's Redis |

## Adding a check

`HealthRegistry` is global. Register from `onModuleInit`, in the module that
owns the dependency:

```ts
@Injectable()
export class SearchHealthCheck implements OnModuleInit {
  constructor(
    private readonly registry: HealthRegistry,
    private readonly search: SearchService,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      name: 'search',
      probes: ['readiness'],
      timeoutMs: 1500,
      check: () => this.search.ping(),
    });
  }
}
```

A check resolves when the dependency is fine and throws when it is not; the
message of what it throws is what `/health` reports. Storage, mail or any
service of your own register the same way.

- Every check runs under a timeout (3 seconds unless it sets `timeoutMs`), and
  all of a probe's checks run in parallel, so one hung dependency costs the
  probe a single timeout rather than the sum of them.
- A check named twice is a boot error, not a silent overwrite.
- Keep **liveness** checks free of anything outside the process. A liveness
  check on the database is the restart loop described above.
- While [maintenance mode](/HeryJs/guides/maintenance) is on, `/health/*` keeps
  answering, so the orchestrator does not kill the instance that is refusing
  traffic on purpose.
