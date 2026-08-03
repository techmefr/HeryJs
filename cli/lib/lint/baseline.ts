import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Violation } from './types';

export interface BaselineEntry {
  rule: string;
  hash: string;
  count: number;
  file: string;
}

export interface Baseline {
  version: 1;
  entries: BaselineEntry[];
}

const EMPTY_BASELINE: Baseline = { version: 1, entries: [] };

export function loadBaseline(filePath: string): Baseline {
  if (!existsSync(filePath)) {
    return EMPTY_BASELINE;
  }

  const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Baseline;
  return { version: 1, entries: parsed.entries ?? [] };
}

export function writeBaseline(filePath: string, baseline: Baseline): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(baseline, null, 2) + '\n');
}

export function hashOf(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * A baseline entry is keyed by the rule and the exact byte content of the
 * file it was recorded against -- never by path. That is the deliberate
 * choice between the two options on the table: keyed by path, a rename
 * reintroduces every violation the file carries for no real reason; keyed by
 * content, a rename carries the grandfathering with it and any edit drops it,
 * new content or not. The second reads as more honest -- a file only loses
 * its pass once someone actually touches it, which is exactly when fixing the
 * violation instead costs nothing extra. `file` is kept on the entry as a
 * human-readable label only; it never takes part in the lookup, so two
 * unrelated files that happen to share content also happen to share the
 * grandfathering, which is a rare and harmless coincidence rather than a gap.
 */
export function partitionViolations(
  violations: Violation[],
  baseline: Baseline,
  fileContents: Map<string, string>,
): { fresh: Violation[]; grandfathered: number } {
  const remaining = new Map(
    baseline.entries.map((entry) => [
      `${entry.rule}:${entry.hash}`,
      entry.count,
    ]),
  );

  const byGroup = new Map<string, Violation[]>();
  for (const violation of violations) {
    const key = `${violation.rule}:${violation.file}`;
    byGroup.set(key, [...(byGroup.get(key) ?? []), violation]);
  }

  const fresh: Violation[] = [];
  let grandfathered = 0;

  for (const group of byGroup.values()) {
    const first = group[0];

    if (!first) {
      continue;
    }

    const { rule, file } = first;
    const content = fileContents.get(file) ?? '';
    const hash = hashOf(content);
    const baselineKey = `${rule}:${hash}`;
    const known = remaining.get(baselineKey) ?? 0;
    const covered = Math.min(known, group.length);

    grandfathered += covered;
    fresh.push(...group.slice(covered));
  }

  return { fresh, grandfathered };
}

export function baselineFrom(
  violations: Violation[],
  fileContents: Map<string, string>,
): Baseline {
  const counts = new Map<string, BaselineEntry>();

  for (const violation of violations) {
    const content = fileContents.get(violation.file) ?? '';
    const hash = hashOf(content);
    const key = `${violation.rule}:${hash}`;
    const existing = counts.get(key);

    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(key, {
      rule: violation.rule,
      hash,
      count: 1,
      file: violation.file,
    });
  }

  return { version: 1, entries: [...counts.values()] };
}
