import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { registerModule } from '../lib/module-registry';

const TYPES_FILE = 'src/modules/mail/mail.types.ts';
const CONSTANTS_FILE = 'src/modules/mail/mail.constants.ts';
const PROVIDER_FILE = 'src/modules/mail/console-mail.provider.ts';
const TEMPLATES_FILE = 'src/modules/mail/mail.templates.ts';
const SERVICE_FILE = 'src/modules/mail/mail.service.ts';
const PROCESSOR_FILE = 'src/modules/mail/mail.processor.ts';
const CONTROLLER_FILE = 'src/modules/mail/mail.controller.ts';
const MODULE_FILE = 'src/modules/mail/mail.module.ts';
const SCHEMA_FILE = 'prisma/schema.prisma';

const MAIL_LOG_MODEL = `
model MailLog {
  id        String    @id @default(cuid())
  tenantId  String
  to        String
  subject   String
  status    String    @default("queued")
  error     String?
  createdAt DateTime  @default(now())
  sentAt    DateTime?

  @@index([tenantId])
}
`;

const TYPES_CONTENT = `export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');
`;

const CONSTANTS_CONTENT = `export const MAIL_SEND_JOB = 'mail.send';
`;

const PROVIDER_CONTENT = `import { Injectable, Logger } from '@nestjs/common';
import type { MailMessage, MailProvider } from './mail.types';

// Safe zero-config default: logs instead of sending, so a freshly generated
// app never accidentally emails anyone. Swap MAIL_PROVIDER for a real SMTP
// or API-based provider later without touching MailService or its callers.
@Injectable()
export class ConsoleMailProvider implements MailProvider {
  private readonly logger = new Logger('Mail');

  send(message: MailMessage): Promise<void> {
    this.logger.log(\`to=\${message.to} subject="\${message.subject}"\`);
    return Promise.resolve();
  }
}
`;

const TEMPLATES_CONTENT = `interface MailTemplate {
  subject: string;
  html: string;
}

const templates: Record<string, MailTemplate> = {
  welcome: {
    subject: 'Welcome to {{app}}',
    html: '<p>Hi {{name}}, welcome to {{app}}.</p>',
  },
};

function interpolate(text: string, data: Record<string, string>): string {
  return text.replace(/\\{\\{(\\w+)\\}\\}/g, (_, key: string) => data[key] ?? '');
}

export function renderTemplate(
  name: string,
  data: Record<string, string> = {},
): { subject: string; html: string } {
  const template = templates[name];
  if (!template) {
    throw new Error(\`Unknown mail template "\${name}"\`);
  }

  return {
    subject: interpolate(template.subject, data),
    html: interpolate(template.html, data),
  };
}
`;

const SERVICE_CONTENT = `import { Inject, Injectable } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { PRISMA_CLIENT } from '../prisma/prisma.client';
import type { TenantScopedPrismaClient } from '../prisma/prisma.client';
import { TenantContextStorage } from '../tenancy/tenant-context';
import { MAIL_SEND_JOB } from './mail.constants';
import { renderTemplate } from './mail.templates';

@Injectable()
export class MailService {
  constructor(
    private readonly jobs: JobsService,
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  list(tenantId: string) {
    return this.prisma.mailLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async queue(
    to: string,
    template: string,
    data: Record<string, string> = {},
  ): Promise<void> {
    const { subject, html } = renderTemplate(template, data);
    const tenantId = TenantContextStorage.getTenantId();

    const log = await this.prisma.mailLog.create({
      data: { tenantId, to, subject, status: 'queued' },
    });

    await this.jobs.dispatch(MAIL_SEND_JOB, { mailLogId: log.id, to, subject, html });
  }
}
`;

const PROCESSOR_CONTENT = `import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { DEFAULT_QUEUE } from '../jobs/jobs.constants';
import { PRISMA_CLIENT } from '../prisma/prisma.client';
import type { TenantScopedPrismaClient } from '../prisma/prisma.client';
import { MAIL_PROVIDER } from './mail.types';
import type { MailProvider } from './mail.types';

interface MailSendJobData {
  mailLogId: string;
  to: string;
  subject: string;
  html: string;
}

@Processor(DEFAULT_QUEUE)
export class MailProcessor extends WorkerHost {
  constructor(
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'mail.send') {
      return;
    }

    const { mailLogId, to, subject, html } = job.data as MailSendJobData;

    try {
      await this.provider.send({ to, subject, html });
      await this.prisma.mailLog.update({
        where: { id: mailLogId },
        data: { status: 'sent', sentAt: new Date() },
      });
    } catch (error) {
      await this.prisma.mailLog.update({
        where: { id: mailLogId },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : 'unknown error',
        },
      });
      throw error;
    }
  }
}
`;

const CONTROLLER_CONTENT = `import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { ok } from '../http/envelope';
import { TenantContextStorage } from '../tenancy/tenant-context';
import { MailService } from './mail.service';

@Controller('mail')
@UseGuards(SessionGuard)
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get()
  async list() {
    return ok(await this.mail.list(TenantContextStorage.getTenantId()));
  }
}
`;

const MODULE_CONTENT = `import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ConsoleMailProvider } from './console-mail.provider';
import { MailController } from './mail.controller';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';
import { MAIL_PROVIDER } from './mail.types';

@Module({
  imports: [PrismaModule, AuthModule, JobsModule],
  controllers: [MailController],
  providers: [
    MailService,
    MailProcessor,
    { provide: MAIL_PROVIDER, useClass: ConsoleMailProvider },
  ],
  exports: [MailService],
})
export class MailModule {}
`;

function patchSchema(): void {
  const schema = readFileSync(SCHEMA_FILE, 'utf8');

  if (schema.includes('model MailLog')) {
    console.log(pc.yellow(`${SCHEMA_FILE} already has MailLog, skipping.`));
    return;
  }

  writeFileSync(SCHEMA_FILE, schema.trimEnd() + '\n' + MAIL_LOG_MODEL);
  console.log(pc.green(`✔ patched ${SCHEMA_FILE}`));
}

registerModule({
  name: 'mail',
  description:
    'Add outgoing mail: a MailLog resource, string templates, and a BullMQ job that actually sends. Ships with a console-logging provider by default -- swap MAIL_PROVIDER for a real one.',
  dependencies: [],
  install() {
    const files: Record<string, string> = {
      [TYPES_FILE]: TYPES_CONTENT,
      [CONSTANTS_FILE]: CONSTANTS_CONTENT,
      [PROVIDER_FILE]: PROVIDER_CONTENT,
      [TEMPLATES_FILE]: TEMPLATES_CONTENT,
      [SERVICE_FILE]: SERVICE_CONTENT,
      [PROCESSOR_FILE]: PROCESSOR_CONTENT,
      [CONTROLLER_FILE]: CONTROLLER_CONTENT,
      [MODULE_FILE]: MODULE_CONTENT,
    };

    for (const [filePath, content] of Object.entries(files)) {
      if (existsSync(filePath)) {
        console.log(pc.yellow(`${filePath} already exists, skipping.`));
        continue;
      }

      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, content);
      console.log(pc.green(`✔ ${filePath}`));
    }

    patchSchema();

    console.log('');
    console.log(pc.cyan('Next steps:'));
    console.log(`  1. Run "pnpm hery migrate --name add_mail_log"`);
    console.log(`  2. Import ${pc.bold('MailModule')} into src/app.module.ts`);
    console.log(
      `  3. Inject ${pc.bold('MailService')} and call ${pc.bold('.queue(to, templateName, data)')} from any resource that needs to send mail`,
    );
  },
});
