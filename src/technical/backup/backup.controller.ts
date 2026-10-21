import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { SessionGuard } from '#technical/auth/session.guard';
import { CapabilitiesGuard } from '#technical/capabilities/capabilities.guard';
import { Capability } from '#technical/capabilities/capability.decorator';
import { ok } from '#technical/http/envelope';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import { BackupSettingsStore, backupSettingsSchema } from './backup-settings';
import type { BackupSettings } from './backup-settings';
import { BackupService } from './backup.service';
import { BACKUP_TASK_NAME, BackupTask } from './backup.task';
import { canManageBackups } from './backup.policy';
import { restoreBackupSchema } from './restore-backup.dto';
import type { RestoreBackupDto } from './restore-backup.dto';

@Controller('backups')
@UseGuards(SessionGuard, CapabilitiesGuard)
export class BackupController {
  constructor(
    private readonly backups: BackupService,
    private readonly settings: BackupSettingsStore,
    private readonly task: BackupTask,
    private readonly runs: ScheduledTaskStore,
  ) {}

  @UnpaginatedRoute(
    'the dumps of one database in one directory, bounded by the retention count',
  )
  @RateLimit('read')
  @Get()
  @Capability(canManageBackups)
  async list() {
    return ok(await this.backups.list());
  }

  @RateLimit('write')
  @Post()
  @Capability(canManageBackups)
  async create() {
    return ok(await this.backups.create());
  }

  @UnpaginatedRoute('one object: the schedule and its last run')
  @RateLimit('read')
  @Get('schedule')
  @Capability(canManageBackups)
  async schedule() {
    return ok({
      ...(await this.settings.get()),
      lastRun:
        this.runs.list().find((run) => run.name === BACKUP_TASK_NAME) ?? null,
    });
  }

  @RateLimit('write')
  @Put('schedule')
  @Capability(canManageBackups)
  async updateSchedule(
    @Body(new ZodValidationPipe(backupSettingsSchema)) body: BackupSettings,
  ) {
    const saved = await this.settings.save(body);
    this.task.apply(saved);

    return ok(saved);
  }

  @RateLimit('read')
  @Get(':name/download')
  @Capability(canManageBackups)
  async download(@Param('name') name: string) {
    return new StreamableFile(
      createReadStream(await this.backups.pathOf(name)),
      {
        type: 'application/octet-stream',
        disposition: `attachment; filename="${name}"`,
      },
    );
  }

  /**
   * The body must repeat the dump's own name. A restore overwrites the live
   * database, so a stray click or a replayed request is not enough: the caller
   * has to say which dump it means.
   */
  @RateLimit('write')
  @Post(':name/restore')
  @Capability(canManageBackups)
  async restore(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(restoreBackupSchema)) body: RestoreBackupDto,
  ) {
    await this.backups.pathOf(name);

    if (body.confirm !== name) {
      throw new BadRequestException(
        'The confirmation does not match the backup name; nothing was restored.',
      );
    }

    await this.backups.restore(name);

    return ok({ restored: true });
  }
}
