import { Injectable } from '@nestjs/common';
import type { RegisteredAction } from './exposition.types';

@Injectable()
export class ExpositionRegistry {
  private readonly actions = new Map<string, RegisteredAction>();

  register(action: RegisteredAction): void {
    if (!action.name.includes('.')) {
      throw new Error(
        `exposition: "${action.name}" is not a provenance.thing name`,
      );
    }

    if (this.actions.has(action.name)) {
      throw new Error(`exposition: duplicate action name "${action.name}"`);
    }

    this.actions.set(action.name, action);
  }

  get(name: string): RegisteredAction | undefined {
    return this.actions.get(name);
  }

  all(): RegisteredAction[] {
    return [...this.actions.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }
}
