#!/usr/bin/env node
'use strict';

const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const OUTPUT_FILE = 'hery-annotations.json';

function reply(id, result) {
  process.stderr.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function fail(id, error) {
  process.stderr.write(
    `${JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: error.message,
        data: { stack: error.stack },
      },
    })}\n`,
  );
}

function clientOutput(options) {
  const client = options.otherGenerators.find(
    (generator) => generator.provider.value === 'prisma-client-js',
  );

  if (!client || !client.output || !client.output.value) {
    throw new Error(
      'the hery registry generator writes next to the prisma-client-js output, and the schema declares none',
    );
  }

  return client.output.value;
}

function snapshot(dmmf) {
  return dmmf.datamodel.models.map((model) => ({
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
    `${JSON.stringify({ models: snapshot(options.dmmf) }, null, 2)}\n`,
  );
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);

  try {
    if (message.method === 'getManifest') {
      reply(message.id, {
        manifest: {
          prettyName: 'HeryJs model annotations',
          defaultOutput: '.',
          requiresGenerators: ['prisma-client-js'],
        },
      });
      return;
    }

    if (message.method === 'generate') {
      generate(message.params);
      reply(message.id, null);
    }
  } catch (error) {
    fail(message.id, error);
  }
});
