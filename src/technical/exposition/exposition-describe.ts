import type { ExposedFieldSpec, RegisteredAction } from './exposition.types';

export interface DescribedParam {
  name: string;
  spec: ExposedFieldSpec;
}

export interface DescribedAction {
  name: string;
  capability: string;
  environments?: readonly string[];
  params: DescribedParam[];
}

export function describeAction(action: RegisteredAction): DescribedAction {
  return {
    name: action.name,
    capability: action.capability.name || 'anonymous',
    environments: action.environments,
    params: action.params.map(({ name, spec }) => ({ name, spec })),
  };
}
