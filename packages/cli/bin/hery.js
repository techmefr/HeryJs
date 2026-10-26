#!/usr/bin/env node
'use strict';

const path = require('node:path');

require('ts-node').register({
  project: path.join(process.cwd(), 'tsconfig.json'),
  transpileOnly: true,
});

require('../dist/hery.js');
