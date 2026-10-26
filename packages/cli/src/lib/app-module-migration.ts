import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { APP_MODULE } from './app-module-patch';
import {
  EMPTY_REGISTRY,
  HERY_CONFIG_FILE,
  HERY_MODULES_FILE,
  contractIdentifier,
  contractSpecifier,
  declareModule,
  registerContract,
} from './hery-config-patch';

/**
 * What `HeryModule.forRoot` imports before the declared modules: the kernel
 * an AppModule wired by hand before it. A project whose AppModule wires
 * anything else from the kernel, or leaves part of it out, is not converted,
 * since HeryModule would then boot a different graph.
 */
export const KERNEL_IMPORTS = [
  'LoggerModule.forRoot',
  'AdminStudioModule',
  'AuditModule',
  'AuthModule',
  'CacheModule',
  'ChangeFeedModule',
  'DevDashboardModule',
  'EtagModule',
  'ErrorReporterModule',
  'EventsModule',
  'ExpositionModule',
  'FeatureFlagsModule',
  'IdempotencyModule',
  'InspectorModule',
  'IntrospectionModule',
  'JobFlowsModule',
  'JobsModule',
  'LogShippingModule',
  'MaintenanceModule',
  'MonitoringModule',
  'NotificationsModule',
  'OutboxModule',
  'OutputCacheModule',
  'PipelineModule',
  'PrivacyModule',
  'BackupModule',
  'PruneModule',
  'QuotasModule',
  'RateLimitModule',
  'SchedulerModule',
  'SecretsModule',
  'SeedersModule.forRoot([])',
  'SignalModule',
  'TeamsModule',
  'TelemetryModule',
] as const;

export const KERNEL_MIDDLEWARE = [
  'TelemetryMiddleware',
  'SecurityHeadersMiddleware',
  'MaintenanceMiddleware',
  'LocaleMiddleware',
  'DevDashboardMiddleware',
  'PipelineMiddleware',
  'TenantMiddleware',
  'InspectorMiddleware',
] as const;

const KERNEL_SOURCES =
  /^(@heryjs\/core\/|#technical\/|#devtools\/|nestjs-pino$)/;
const FRAMEWORK_SOURCES = new Set([
  '@nestjs/common',
  '@nestjs/core',
  './app.controller',
  './app.service',
]);

interface ImportLine {
  text: string;
  names: string[];
  source: string;
}

function importLines(source: string): ImportLine[] {
  return [
    ...source.matchAll(
      /^import (type )?\{([^}]*)\} from '([^']+)';\n|^import ([^{\n]+) from '([^']+)';\n/gm,
    ),
  ].map((match) => ({
    text: match[0],
    names: (match[2] ?? match[4] ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== ''),
    source: match[3] ?? match[5] ?? '',
  }));
}

/** Splits an array literal's body on its top-level commas. */
function topLevelEntries(body: string): string[] {
  const entries: string[] = [];
  let depth = 0;
  let current = '';

  for (const character of body) {
    if ('([{'.includes(character)) {
      depth += 1;
    } else if (')]}'.includes(character)) {
      depth -= 1;
    }

    if (character === ',' && depth === 0) {
      entries.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }

  entries.push(current.trim());

  return entries.filter((entry) => entry !== '');
}

function arrayBody(source: string, key: string): string | undefined {
  const start = new RegExp(`\\b${key}: \\[`).exec(source);

  if (start === null) {
    return undefined;
  }

  let depth = 1;
  let index = start.index + start[0].length;

  while (index < source.length && depth > 0) {
    const character = source[index]!;

    if ('([{'.includes(character)) {
      depth += 1;
    } else if (')]}'.includes(character)) {
      depth -= 1;
    }

    index += 1;
  }

  return source.slice(start.index + start[0].length, index - 1);
}

function stripComments(text: string): string {
  return text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function kernelKey(entry: string): string {
  return entry.startsWith('LoggerModule.forRoot(')
    ? 'LoggerModule.forRoot'
    : entry.replace(/\s+/g, '');
}

export interface AppModuleMigration {
  changed: string[];
  problems: string[];
}

/**
 * Converts an AppModule that wires the kernel and its modules by hand into
 * `HeryModule.forRoot(heryConfig, heryModules)`: each `#modules/<name>` class
 * becomes an entry of hery.config.ts and a contract in src/hery.modules.ts,
 * the kernel wiring goes, and the project's own imports stay. Refused, with
 * the reason, whenever the result would boot a different graph.
 */
export function appModuleWiresByHand(root: string): boolean {
  const appModuleFile = path.join(root, APP_MODULE);

  return (
    existsSync(appModuleFile) &&
    !readFileSync(appModuleFile, 'utf8').includes('HeryModule.forRoot(')
  );
}

export function migrateAppModuleWiring(
  root: string,
  reference: string,
  options: { write: boolean },
): AppModuleMigration {
  const appModuleFile = path.join(root, APP_MODULE);

  if (!existsSync(appModuleFile)) {
    return { changed: [], problems: [] };
  }

  const source = readFileSync(appModuleFile, 'utf8');

  if (source.includes('HeryModule.forRoot(')) {
    return { changed: [], problems: [] };
  }

  const lines = importLines(source);
  const moduleClasses = new Map<string, string>();

  for (const line of lines) {
    const found = /^#modules\/([^/]+)\//.exec(line.source);

    if (found !== null) {
      line.names.forEach((name) => moduleClasses.set(name, found[1]!));
    }
  }

  const kernelNames = new Set(
    lines
      .filter((line) => KERNEL_SOURCES.test(line.source))
      .flatMap((line) => line.names),
  );
  const imports = topLevelEntries(
    stripComments(arrayBody(source, 'imports') ?? ''),
  );
  const problems: string[] = [];
  const declared: string[] = [];
  const projectImports: string[] = [];
  const kernelSeen: string[] = [];

  for (const entry of imports) {
    const className = /^(\w+)/.exec(entry)?.[1] ?? entry;
    const moduleName = moduleClasses.get(className);

    if (moduleName !== undefined) {
      if (!/^\w+(\.forRoot\(\s*\))?$/.test(entry)) {
        problems.push(
          `${entry}: pass these options as ['@heryjs/${moduleName}', { ... }] in ${HERY_CONFIG_FILE} by hand`,
        );
      }

      if (!declared.includes(moduleName)) {
        declared.push(moduleName);
      }
    } else if (kernelNames.has(className)) {
      kernelSeen.push(kernelKey(entry));
    } else {
      projectImports.push(entry);
    }
  }

  const missing = KERNEL_IMPORTS.filter((entry) => !kernelSeen.includes(entry));
  const extra = kernelSeen.filter(
    (entry) => !(KERNEL_IMPORTS as readonly string[]).includes(entry),
  );

  if (missing.length > 0) {
    problems.push(
      `${APP_MODULE} does not import ${missing.join(', ')}, which HeryModule always does`,
    );
  }

  if (extra.length > 0) {
    problems.push(
      `${APP_MODULE} wires ${extra.join(', ')} from the kernel, which HeryModule does not`,
    );
  }

  const middleware = [
    ...stripComments(source).matchAll(/consumer\.apply\(([^)]*)\)/g),
  ].map((match) => match[1]!.trim());

  if (middleware.join(',') !== KERNEL_MIDDLEWARE.join(',')) {
    problems.push(
      `${APP_MODULE} applies ${middleware.join(', ') || 'no middleware'}, not the kernel's ${KERNEL_MIDDLEWARE.join(', ')}`,
    );
  }

  const controllers = topLevelEntries(
    stripComments(arrayBody(source, 'controllers') ?? ''),
  );
  const providers = topLevelEntries(
    stripComments(arrayBody(source, 'providers') ?? ''),
  ).filter(
    (entry) =>
      entry.replace(/\s+/g, ' ') !==
      '{ provide: APP_FILTER, useClass: DomainExceptionFilter }',
  );

  for (const moduleName of declared) {
    const contract = path.join(
      'src',
      'modules',
      moduleName,
      `${moduleName}.hery.ts`,
    );
    const shipped = path.join(
      reference,
      'packages',
      moduleName,
      'src',
      'runtime',
      `${moduleName}.hery.ts`,
    );

    if (!existsSync(path.join(root, contract)) && !existsSync(shipped)) {
      problems.push(
        `${moduleName} ships no ${moduleName}.hery.ts contract to declare it with`,
      );
    }
  }

  if (problems.length > 0) {
    return { changed: [], problems };
  }

  const changed: string[] = [];
  const configFile = path.join(root, HERY_CONFIG_FILE);
  const registryFile = path.join(root, HERY_MODULES_FILE);
  let config = readFileSync(configFile, 'utf8');
  let registry = existsSync(registryFile)
    ? readFileSync(registryFile, 'utf8')
    : EMPTY_REGISTRY;

  for (const moduleName of declared) {
    const contract = path.join(
      'src',
      'modules',
      moduleName,
      `${moduleName}.hery.ts`,
    );

    if (!existsSync(path.join(root, contract))) {
      changed.push(contract);

      if (options.write) {
        copyFileSync(
          path.join(
            reference,
            'packages',
            moduleName,
            'src',
            'runtime',
            `${moduleName}.hery.ts`,
          ),
          path.join(root, contract),
        );
      }
    }

    config = declareModule(config, `@heryjs/${moduleName}`);
    registry = registerContract(
      registry,
      contractIdentifier(moduleName),
      contractSpecifier(path.join('src', 'modules', moduleName), moduleName),
    );
  }

  const kept = lines
    .filter(
      (line) =>
        !KERNEL_SOURCES.test(line.source) &&
        !FRAMEWORK_SOURCES.has(line.source) &&
        !line.source.startsWith('#modules/'),
    )
    .map((line) => line.text)
    .join('');
  const list = (entries: string[]): string =>
    entries.length <= 1
      ? `[${entries.join('')}]`
      : `[\n${entries.map((entry) => `    ${entry},\n`).join('')}  ]`;
  const appModule = `import { Module } from '@nestjs/common';
import { HeryModule } from '@heryjs/core/app';
import { heryConfig } from '@heryjs/core/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
${kept}import { heryModules } from './hery.modules';

@Module({
  imports: ${list(['HeryModule.forRoot(heryConfig, heryModules)', ...projectImports])},
  controllers: ${list(controllers)},
  providers: ${list(providers)},
})
export class AppModule {}
`;

  changed.push(APP_MODULE, HERY_CONFIG_FILE, HERY_MODULES_FILE);

  if (options.write) {
    writeFileSync(appModuleFile, appModule);
    writeFileSync(configFile, config);
    writeFileSync(registryFile, registry);
  }

  return { changed, problems: [] };
}
