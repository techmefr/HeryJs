const MODEL_START = /^model\s+(\w+)\s*\{/;

function fieldName(line: string): string | undefined {
  const trimmed = line.trim();

  if (trimmed === '' || /^(\/\/|@@|\})/.test(trimmed)) {
    return undefined;
  }

  return trimmed.split(/\s+/)[0];
}

function modelFields(schema: string): Map<string, string[]> {
  const models = new Map<string, string[]>();
  let current: string | undefined;

  for (const line of schema.split('\n')) {
    const start = MODEL_START.exec(line);

    if (start) {
      current = start[1]!;
      models.set(current, []);
      continue;
    }

    if (line.startsWith('}')) {
      current = undefined;
      continue;
    }

    if (current !== undefined && fieldName(line) !== undefined) {
      models.get(current)!.push(line);
    }
  }

  return models;
}

/**
 * The kernel's schema as @heryjs/core ships it, with the fields the project's
 * own copy hangs on the kernel's models kept: the back-relations of its
 * resources and the fields its modules add. The kernel's version of a field
 * wins, and a model the kernel no longer ships goes.
 */
export function mergeKernelSchema(packaged: string, current: string): string {
  const projectFields = modelFields(current);
  const output: string[] = [];
  let model: string | undefined;
  let kernelFields = new Set<string>();
  let pending: string[] = [];

  const extras = (): string[] =>
    (projectFields.get(model!) ?? []).filter(
      (line) => !kernelFields.has(fieldName(line)!),
    );

  for (const line of packaged.split('\n')) {
    const start = MODEL_START.exec(line);

    if (start) {
      model = start[1]!;
      kernelFields = new Set(
        (modelFields(packaged).get(model) ?? []).map((field) =>
          fieldName(field)!,
        ),
      );
      pending = [];
      output.push(line);
      continue;
    }

    if (model === undefined) {
      output.push(line);
      continue;
    }

    if (line.startsWith('}')) {
      const attributes = pending.findIndex((pendingLine) =>
        pendingLine.trim().startsWith('@@'),
      );
      const split = attributes === -1 ? pending.length : attributes;
      const before = pending.slice(0, split);
      const trailingBlank =
        before.length > 0 && before[before.length - 1]!.trim() === '' ? 1 : 0;

      output.push(
        ...before.slice(0, before.length - trailingBlank),
        ...extras(),
        ...before.slice(before.length - trailingBlank),
        ...pending.slice(split),
        line,
      );
      model = undefined;
      continue;
    }

    pending.push(line);
  }

  return output.join('\n');
}

function normalisedLines(schema: string): string[] {
  return schema
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line !== '')
    .sort();
}

/** Whether two schemas differ by more than their alignment and line order. */
export function schemasDiffer(left: string, right: string): boolean {
  return (
    JSON.stringify(normalisedLines(left)) !==
    JSON.stringify(normalisedLines(right))
  );
}
