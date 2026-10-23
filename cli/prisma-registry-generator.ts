import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

const OUTPUT_FILE = 'hery-annotations.json';

interface DmmfField {
  name: string;
  kind: string;
  type: string;
  documentation?: string;
}

interface DmmfModel {
  name: string;
  documentation?: string;
  fields: DmmfField[];
}

interface GeneratorOptions {
  dmmf: { datamodel: { models: DmmfModel[] } };
  otherGenerators: {
    provider: { value: string };
    output?: { value: string | null } | null;
  }[];
}

interface RpcMessage {
  id: number;
  method: string;
  params: unknown;
}

function send(message: Record<string, unknown>): void {
  process.stderr.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
}

function clientOutput(options: GeneratorOptions): string {
  const output = options.otherGenerators.find(
    (generator) => generator.provider.value === 'prisma-client-js',
  )?.output?.value;

  if (!output) {
    throw new Error(
      'the hery registry generator writes next to the prisma-client-js output, and the schema declares none',
    );
  }

  return output;
}

function snapshot(models: DmmfModel[]) {
  return models.map((model) => ({
    name: model.name,
    documentation: model.documentation ?? null,
    fields: model.fields.map((field) => ({
      name: field.name,
      kind: field.kind,
      type: field.type,
      documentation: field.documentation ?? null,
    })),
  }));
}

function generate(options: GeneratorOptions): void {
  const dir = clientOutput(options);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, OUTPUT_FILE),
    `${JSON.stringify({ models: snapshot(options.dmmf.datamodel.models) }, null, 2)}\n`,
  );
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line) as RpcMessage;

  try {
    if (message.method === 'getManifest') {
      send({
        id: message.id,
        result: {
          manifest: {
            prettyName: 'HeryJs model annotations',
            defaultOutput: '.',
            requiresGenerators: ['prisma-client-js'],
          },
        },
      });
      return;
    }

    if (message.method === 'generate') {
      generate(message.params as GeneratorOptions);
      send({ id: message.id, result: null });
    }
  } catch (error) {
    send({
      id: message.id,
      error: {
        code: -32000,
        message: (error as Error).message,
        data: { stack: (error as Error).stack },
      },
    });
  }
});
