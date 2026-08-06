import type { PolicyCheck } from '#technical/capabilities/capability-check';

export type ExposedEnvironment = 'development' | 'test' | 'production';

export type ExposedFieldSpec =
  | { kind: 'number'; min: number; max: number; step?: number; default: number }
  | { kind: 'boolean'; default: boolean }
  | { kind: 'string'; maxLength: number; default: string }
  | { kind: 'enum'; values: readonly string[]; default: string };

export interface ExposedParam {
  name: string;
  spec: ExposedFieldSpec;
}

export interface ExposeActionOptions {
  capability: PolicyCheck;
  environments?: readonly ExposedEnvironment[];
}

export interface ExposedActionMeta extends ExposeActionOptions {
  name: string;
}

export interface RegisteredAction extends ExposedActionMeta {
  params: ExposedParam[];
  invoke(args: unknown[]): unknown;
}
