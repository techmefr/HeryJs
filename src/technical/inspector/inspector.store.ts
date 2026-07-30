import { Injectable } from '@nestjs/common';

export interface InspectedRequest {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  tenantId?: string;
  errorMessage?: string;
  timestamp: string;
}

const MAX_ENTRIES = 200;

@Injectable()
export class InspectorStore {
  private readonly entries: InspectedRequest[] = [];

  record(entry: InspectedRequest): void {
    this.entries.unshift(entry);
    this.entries.length = Math.min(this.entries.length, MAX_ENTRIES);
  }

  list(): InspectedRequest[] {
    return this.entries;
  }

  clear(): void {
    this.entries.length = 0;
  }
}
