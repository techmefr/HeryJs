import { bareName, packageNameOf, runtimeImports } from './runtime-imports';

describe('runtime imports', () => {
  const source = `import { json } from 'express';
import type { Request } from 'express-serve-static-core';
import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { helper } from './helper';
import { env } from '#technical/config/env';
export { thing } from 'some-package/sub/path';
const lazy = require('ts-node/register/transpile-only');
`;

  it('names the packages a file loads, without type-only, relative, alias or builtin imports', () => {
    expect(runtimeImports(source).sort()).toEqual([
      '@nestjs/common',
      'express',
      'some-package',
      'ts-node',
    ]);
  });

  it('adds type-only imports when the type checker needs them too', () => {
    expect(runtimeImports(source, true)).toContain('express-serve-static-core');
  });

  it('reads a package from a deep or scoped specifier', () => {
    expect(packageNameOf('@aws-sdk/client-s3/dist')).toBe('@aws-sdk/client-s3');
    expect(packageNameOf('fs')).toBeUndefined();
  });

  it('drops the version of a pnpm-add spec', () => {
    expect(bareName('@node-saml/node-saml@^5.1.0')).toBe(
      '@node-saml/node-saml',
    );
    expect(bareName('xpath@^0.0.34')).toBe('xpath');
    expect(bareName('meilisearch')).toBe('meilisearch');
  });
});
