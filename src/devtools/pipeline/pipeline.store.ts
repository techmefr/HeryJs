import { Injectable } from '@nestjs/common';
import type { TraceStep } from '#technical/tracing/trace-context';

export interface TraceRecord {
  id: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  timestamp: string;
  steps: TraceStep[];
  blockedStepIndex: number | null;
}

const MAX_ENTRIES = 200;

@Injectable()
export class PipelineStore {
  private readonly traces: TraceRecord[] = [];

  record(trace: TraceRecord): void {
    this.traces.unshift(trace);
    this.traces.length = Math.min(this.traces.length, MAX_ENTRIES);
  }

  list(): TraceRecord[] {
    return this.traces;
  }

  clear(): void {
    this.traces.length = 0;
  }
}
