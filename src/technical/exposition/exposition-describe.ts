import type {
  ExposedCronTrigger,
  ExposedFieldSpec,
  RegisteredAction,
} from './exposition.types';

export interface DescribedParam {
  name: string;
  spec: ExposedFieldSpec;
}

export interface DescribedTriggers {
  http: boolean;
  cron: ExposedCronTrigger | null;
  webhook: boolean;
}

export interface DescribedAction {
  name: string;
  capability: string;
  environments?: readonly string[];
  params: DescribedParam[];
  triggers: DescribedTriggers;
}

export function describeAction(action: RegisteredAction): DescribedAction {
  return {
    name: action.name,
    capability: action.capability.name || 'anonymous',
    environments: action.environments,
    params: action.params.map(({ name, spec }) => ({ name, spec })),
    triggers: {
      http: action.triggers?.http !== false,
      cron: action.triggers?.cron ?? null,
      webhook: action.triggers?.webhook === true,
    },
  };
}
