const MODEL_START = /^model\s+(\w+)\s*\{/;

interface ModelBody {
  fields: Map<string, string[]>;
  attributes: string[];
}

function fieldName(line: string): string | undefined {
  const trimmed = line.trim();

  if (trimmed === '' || /^(\/\/|@@|\})/.test(trimmed)) {
    return undefined;
  }

  return trimmed.split(/\s+/)[0];
}

function isAttribute(line: string): boolean {
  return line.trim().startsWith('@@');
}

function isDocComment(line: string): boolean {
  return line.trim().startsWith('///');
}

function modelBodies(schema: string): Map<string, ModelBody> {
  const models = new Map<string, ModelBody>();
  let current: ModelBody | undefined;
  let docs: string[] = [];

  for (const line of schema.split('\n')) {
    const start = MODEL_START.exec(line);

    if (start) {
      current = { fields: new Map(), attributes: [] };
      models.set(start[1]!, current);
      docs = [];
      continue;
    }

    if (line.startsWith('}')) {
      current = undefined;
      continue;
    }

    if (current === undefined) {
      continue;
    }

    if (isDocComment(line)) {
      docs.push(line);
      continue;
    }

    if (isAttribute(line)) {
      current.attributes.push(line);
    } else {
      const name = fieldName(line);

      if (name !== undefined) {
        current.fields.set(name, [...docs, line]);
      }
    }

    docs = [];
  }

  return models;
}

function normalised(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

/**
 * The kernel's schema as @heryjs/core ships it, with the fields the project's
 * own copy hangs on the kernel's models kept: the back-relations of its
 * resources and the fields its modules add, each with the annotations above
 * it, and the model attributes it adds. The kernel's version of a field wins,
 * and a model the kernel no longer ships goes. Given the kernel's schema as
 * last synced, a field or attribute it shipped then and no longer does goes
 * too, where without it the project would keep it as its own.
 */
export function mergeKernelSchema(
  packaged: string,
  current: string,
  base = '',
): string {
  const project = modelBodies(current);
  const kernel = modelBodies(packaged);
  const previous = modelBodies(base);
  const output: string[] = [];
  let model: string | undefined;
  let pending: string[] = [];

  const extraFields = (): string[] => {
    const kernelFields = kernel.get(model!)!.fields;
    const previousFields = previous.get(model!)?.fields ?? new Map();

    return [...(project.get(model!)?.fields ?? new Map<string, string[]>())]
      .filter(([name]) => !kernelFields.has(name) && !previousFields.has(name))
      .flatMap(([, lines]) => lines);
  };

  const extraAttributes = (): string[] => {
    const kernelAttributes = new Set(
      [
        ...kernel.get(model!)!.attributes,
        ...(previous.get(model!)?.attributes ?? []),
      ].map(normalised),
    );

    return (project.get(model!)?.attributes ?? []).filter(
      (line) => !kernelAttributes.has(normalised(line)),
    );
  };

  for (const line of packaged.split('\n')) {
    const start = MODEL_START.exec(line);

    if (start) {
      model = start[1]!;
      pending = [];
      output.push(line);
      continue;
    }

    if (model === undefined) {
      output.push(line);
      continue;
    }

    if (line.startsWith('}')) {
      const attributes = pending.findIndex(isAttribute);
      const split = attributes === -1 ? pending.length : attributes;
      const before = pending.slice(0, split);
      const trailingBlank =
        before.length > 0 && before[before.length - 1]!.trim() === '' ? 1 : 0;
      const addedAttributes = extraAttributes();

      output.push(
        ...before.slice(0, before.length - trailingBlank),
        ...extraFields(),
        ...before.slice(before.length - trailingBlank),
        ...(attributes === -1 && addedAttributes.length > 0 ? [''] : []),
        ...pending.slice(split),
        ...addedAttributes,
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
    .map(normalised)
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
