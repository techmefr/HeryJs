import { AsyncLocalStorage } from 'node:async_hooks';

export type TraceStepStage = 'middleware' | 'guard' | 'controller' | 'prisma';

export type TraceStepStatus = 'ok' | 'blocked' | 'error';

export interface TraceStep {
  stage: TraceStepStage;
  label: string;
  status: TraceStepStatus;
  durationMs: number;
  detail?: unknown;
}

interface TraceContext {
  steps: TraceStep[];
}

const storage = new AsyncLocalStorage<TraceContext>();

// Every stage the pipeline crosses (middleware, guards, the controller
// handler, each Prisma query) calls this from wherever it already lives --
// there is no proxy standing in front of the app rewriting calls, just an
// AsyncLocalStorage context the trace middleware opens once per request,
// the same technique already used for the tenant boundary.
export const TraceContextStorage = {
  run<T>(callback: () => T): T {
    return storage.run({ steps: [] }, callback);
  },

  pushStep(step: TraceStep): void {
    storage.getStore()?.steps.push(step);
  },

  getSteps(): TraceStep[] {
    return storage.getStore()?.steps ?? [];
  },
};
