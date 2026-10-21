import { Injectable } from '@nestjs/common';
import type { VectorTarget } from './vector-target';

@Injectable()
export class VectorTargetRegistry {
  private readonly targets = new Map<string, VectorTarget>();

  track(target: VectorTarget): void {
    this.targets.set(target.table, target);
  }

  find(table: string): VectorTarget | null {
    return this.targets.get(table) ?? null;
  }
}
