export type ModuleChannel = 'official' | 'community';

export interface ModuleDefinition {
  name: string;
  description: string;
  channel: ModuleChannel;
  dependencies?: string[];
  install(): void | Promise<void>;
  uninstall?(): void | Promise<void>;
}

const registry = new Map<string, ModuleDefinition>();

export function registerModule(module: ModuleDefinition): void {
  registry.set(module.name, module);
}

export function listModules(): ModuleDefinition[] {
  return [...registry.values()];
}

export function getModule(name: string): ModuleDefinition | undefined {
  return registry.get(name);
}
