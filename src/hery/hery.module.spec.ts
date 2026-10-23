import { Module } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import {
  APP_FILTER,
  ApplicationConfig,
  MetadataScanner,
  NestContainer,
} from '@nestjs/core';
import { DependenciesScanner, NoopGraphInspector } from '@nestjs/core/internal';
import { LoggerModule } from 'nestjs-pino';
import { AppModule } from '#app.module';
import { AppController } from '../app.controller';
import { AppService } from '../app.service';
import { heryModules } from '../hery.modules';
import {
  AdminStudioModule,
  EtagModule,
  IdempotencyModule,
  OutputCacheModule,
  RateLimitModule,
} from '#technical/public/http';
import { AuditModule, PrivacyModule } from '#technical/public/privacy';
import { AuthModule } from '#technical/public/auth';
import {
  CacheModule,
  EventsModule,
  ExpositionModule,
  FeatureFlagsModule,
  IntrospectionModule,
  MaintenanceModule,
  QuotasModule,
} from '#technical/public/platform';
import { ChangeFeedModule, SignalModule } from '#technical/public/realtime';
import {
  ErrorReporterModule,
  LogShippingModule,
  MonitoringModule,
  TelemetryModule,
} from '#technical/public/observability';
import {
  JobFlowsModule,
  JobsModule,
  OutboxModule,
  SchedulerModule,
} from '#technical/public/jobs';
import { NotificationsModule } from '#technical/public/notifications';
import {
  BackupModule,
  PruneModule,
  SeedersModule,
} from '#technical/public/database';
import { SecretsModule } from '#technical/public/env';
import { TeamsModule } from '#technical/public/tenancy';
import { DomainExceptionFilter } from '#technical/public/errors';
import type { HeryConfig } from '#technical/public/config';
import { HeryModuleConfigError } from '#technical/public/modules';
import {
  DevDashboardModule,
  InspectorModule,
  PipelineModule,
} from '#devtools/public';
import { ExportModule } from '#modules/export/export.module';
import { ImpersonationModule } from '#modules/impersonation/impersonation.module';
import { MailModule } from '#modules/mail/mail.module';
import notifierHeryModule from '#modules/notifier/notifier.hery';
import { OAuthModule } from '#modules/oauth/oauth.module';
import { ScimModule } from '#modules/scim/scim.module';
import { SseModule } from '#modules/sse/sse.module';
import { SsoModule } from '#modules/sso/sso.module';
import { StorageModule } from '#modules/storage/storage.module';
import { WebhooksModule } from '#modules/webhooks/webhooks.module';
import { HeryModule } from './hery.module';

@Module({
  imports: [
    LoggerModule.forRoot(),
    AdminStudioModule,
    AuditModule,
    AuthModule,
    CacheModule,
    ChangeFeedModule,
    DevDashboardModule,
    EtagModule,
    ErrorReporterModule,
    EventsModule,
    ExportModule,
    ExpositionModule,
    FeatureFlagsModule,
    IdempotencyModule,
    ImpersonationModule,
    InspectorModule,
    IntrospectionModule,
    JobFlowsModule,
    JobsModule,
    LogShippingModule,
    MailModule,
    MaintenanceModule,
    MonitoringModule,
    NotificationsModule,
    OutboxModule,
    OutputCacheModule,
    PipelineModule,
    PrivacyModule,
    BackupModule,
    PruneModule,
    QuotasModule,
    RateLimitModule,
    OAuthModule.forRoot(),
    SchedulerModule,
    SecretsModule,
    SeedersModule.forRoot([]),
    SignalModule,
    SseModule,
    SsoModule.forRoot(),
    ScimModule,
    StorageModule,
    TeamsModule,
    TelemetryModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
class HandWiredAppModule {}

const ROOTS = new Set(['AppModule', 'HandWiredAppModule', 'HeryModule']);

function label(token: unknown): string {
  const name =
    typeof token === 'function'
      ? token.name
      : typeof token === 'symbol'
        ? token.toString()
        : String(token);

  return name.replace(/ \(UUID: [^)]+\)$/, '');
}

interface ProviderGraph {
  modules: string[];
  providers: string[];
  controllers: string[];
}

async function providerGraph(root: Type<unknown>): Promise<ProviderGraph> {
  const config = new ApplicationConfig();
  const container = new NestContainer(config);
  const scanner = new DependenciesScanner(
    container,
    new MetadataScanner(),
    NoopGraphInspector,
    config,
  );
  await scanner.scan(root);

  const modules = [...container.getModules().values()];
  const nonRoot = modules.filter((module) => !ROOTS.has(module.metatype.name));
  const providerNames = (module: (typeof modules)[number]): string[] =>
    [...module.providers.keys()]
      .map(label)
      .filter(
        (name) =>
          !ROOTS.has(name) &&
          name !== 'ModuleRef' &&
          name !== 'ApplicationConfig',
      );

  return {
    modules: nonRoot
      .map(
        (module) =>
          `${module.metatype.name}: ${providerNames(module).sort().join(', ')}`,
      )
      .sort(),
    providers: modules.flatMap(providerNames).sort(),
    controllers: modules
      .flatMap((module) => [...module.controllers.keys()].map(label))
      .sort(),
  };
}

describe('HeryModule', () => {
  it('builds the same provider graph as the hand-wired AppModule it replaces', async () => {
    const [handWired, declared] = await Promise.all([
      providerGraph(HandWiredAppModule),
      providerGraph(AppModule),
    ]);

    expect(handWired.modules).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^SsoModule: .*SSO_LOGIN_HANDLER/),
        expect.stringMatching(/^WebhooksModule: /),
      ]),
    );
    expect(declared.modules).toEqual(handWired.modules);
    expect(declared.providers).toEqual(handWired.providers);
    expect(declared.controllers).toEqual(handWired.controllers);
  });

  it('wires every module hery.config.ts declares', () => {
    const config: HeryConfig = {
      modules: heryModules.map((contract) => contract.name),
    };

    expect(() => HeryModule.forRoot(config, heryModules)).not.toThrow();
  });

  it('loads every declared module from its package when none is passed in', () => {
    const config: HeryConfig = {
      modules: heryModules.map((contract) => contract.name),
    };

    const moduleClasses = (imports: unknown[] = []): unknown[] =>
      imports.map((entry) =>
        typeof entry === 'object' && entry !== null && 'module' in entry
          ? entry.module
          : entry,
      );

    expect(moduleClasses(HeryModule.forRoot(config).imports)).toEqual(
      moduleClasses(HeryModule.forRoot(config, heryModules).imports),
    );
    expect(moduleClasses(HeryModule.forRoot(config).imports)).toContain(
      SsoModule,
    );
  });

  it.each<[string, HeryConfig, string]>([
    [
      'a module that is not installed',
      { modules: ['@heryjs/billing'] },
      '@heryjs/billing: unknown module, it is not installed. Run "hery install billing"',
    ],
    [
      'options the module refuses',
      { modules: [['@heryjs/sso', { loginHandler: 'session' }]] },
      '@heryjs/sso: invalid options, loginHandler: expected a class',
    ],
    [
      'a required module that is not declared',
      { modules: ['@heryjs/notifier'] },
      '@heryjs/notifier: requires @heryjs/mail, @heryjs/sms, @heryjs/push',
    ],
  ])('stops the boot on %s', (_case, config, message) => {
    const installed = [...heryModules, notifierHeryModule];

    expect(() => HeryModule.forRoot(config, installed)).toThrow(
      HeryModuleConfigError,
    );
    expect(() => HeryModule.forRoot(config, installed)).toThrow(message);
  });
});
