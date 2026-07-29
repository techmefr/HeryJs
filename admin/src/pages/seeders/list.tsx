import { useEffect, useState } from 'react';
import { apiFetch } from '../../api-fetch';

interface SeederInfo {
  name: string;
  description: string;
  defaultCount: number;
  maxCount: number;
}

type RunState = 'idle' | 'running' | { count: number } | { error: string };

export function SeedersList() {
  const [seeders, setSeeders] = useState<SeederInfo[] | null>(null);
  const [runState, setRunState] = useState<Record<string, RunState>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    apiFetch('/seeders').then((body) => {
      setSeeders(body.data);
      setCounts(
        Object.fromEntries(
          (body.data as SeederInfo[]).map((seeder) => [
            seeder.name,
            seeder.defaultCount,
          ]),
        ),
      );
    });
  }, []);

  async function run(name: string) {
    setRunState((state) => ({ ...state, [name]: 'running' }));
    try {
      const body = await apiFetch(`/seeders/${name}/run`, {
        method: 'POST',
        body: JSON.stringify({ count: counts[name] }),
      });
      setRunState((state) => ({ ...state, [name]: { count: body.data.count } }));
    } catch {
      setRunState((state) => ({
        ...state,
        [name]: { error: 'Failed to run seeder' },
      }));
    }
  }

  if (!seeders) {
    return (
      <p className="text-neutral-500 dark:text-neutral-400">Loading...</p>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Seeders</h1>
      <div className="flex max-w-2xl flex-col gap-3">
        {seeders.map((seeder) => {
          const state = runState[seeder.name] ?? 'idle';
          const count = counts[seeder.name] ?? seeder.defaultCount;
          return (
            <div
              key={seeder.name}
              className="flex items-center justify-between rounded border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div>
                <p className="font-mono text-sm">{seeder.name}</p>
                <p className="text-xs text-neutral-500">{seeder.description}</p>
              </div>
              <div className="flex items-center gap-3">
                {typeof state === 'object' && 'count' in state ? (
                  <span className="text-xs text-emerald-400">
                    Created {state.count}
                  </span>
                ) : null}
                {typeof state === 'object' && 'error' in state ? (
                  <span className="text-xs text-red-400">{state.error}</span>
                ) : null}
                <input
                  type="number"
                  min={1}
                  max={seeder.maxCount}
                  value={count}
                  onChange={(event) =>
                    setCounts((state) => ({
                      ...state,
                      [seeder.name]: Number(event.target.value),
                    }))
                  }
                  className="w-20 rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                />
                <button
                  type="button"
                  onClick={() => run(seeder.name)}
                  disabled={state === 'running'}
                  className="rounded bg-orange-600 px-3 py-1.5 text-sm text-white hover:bg-orange-500 disabled:opacity-50"
                >
                  {state === 'running' ? 'Running...' : 'Run'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
