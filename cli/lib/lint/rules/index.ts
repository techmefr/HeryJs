import { noAnyRule } from './no-any';
import { noPrismaInControllerRule } from './no-prisma-in-controller';
import { noRawProcessEnvRule } from './no-raw-process-env';
import { resourceShapeRule } from './resource-shape';
import type { LintRule } from '../types';

export const LINT_RULES: LintRule[] = [
  noAnyRule,
  noRawProcessEnvRule,
  noPrismaInControllerRule,
  resourceShapeRule,
];
