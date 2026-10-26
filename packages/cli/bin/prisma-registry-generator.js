#!/usr/bin/env node
'use strict';

const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const OUTPUT_FILE = 'hery-annotations.json';

function send(message) {
  process.stderr.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
}

function clientOutput(options) {
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

function snapshot(models) {
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

function generate(options) {
  const dir = clientOutput(options);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, OUTPUT_FILE),
    `${JSON.stringify({ models: snapshot(options.dmmf.datamodel.models) }, null, 2)}\n`,
  );
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);

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
      generate(message.params);
      send({ id: message.id, result: null });
    }
  } catch (error) {
    send({
      id: message.id,
      error: {
        code: -32000,
        message: error.message,
        data: { stack: error.stack },
      },
    });
  }
});
