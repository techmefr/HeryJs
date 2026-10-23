export type Severity = 'critical' | 'major' | 'minor';

export interface Violation {
  rule: string;
  severity: Severity;
  file: string;
  line?: number;
  message: string;
}

export interface LintRule {
  name: string;
  run: (repoRoot: string) => Violation[];
}
