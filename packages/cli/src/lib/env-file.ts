import { readFileSync, writeFileSync } from 'node:fs';

export function upsertEnvVar(
  filePath: string,
  key: string,
  value: string,
): void {
  const content = readFileSync(filePath, 'utf-8');
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}="${value}"`;

  const updated = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.trimEnd()}\n${line}\n`;

  writeFileSync(filePath, updated);
}

export function replaceUrlPort(url: string, port: number): string {
  const parsed = new URL(url);
  parsed.port = String(port);
  return parsed.toString();
}
