import { Controller, Get } from '@nestjs/common';
import { Capability } from '#technical/capabilities/capability.decorator';
import { HealthRegistry } from '#technical/health/health-registry';
import type { HealthProbe } from '#technical/health/health-check';
import { ok } from '#technical/http/envelope';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { ScheduledTaskStore } from '#technical/scheduler/scheduled-task.store';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { AdminSection } from './admin-metadata';
import { adminStudioSettings } from './admin-settings';
import { AdminStudio } from './admin-studio.guard';
import { canReadStudioOverview } from './studio.policy';

const PROBES: HealthProbe[] = ['liveness', 'readiness'];

/**
 * How the deployment is doing, readable in production: the health checks
 * every feature registers, the last run of each scheduled task, and the few
 * facts about the process an operator asks first. `/scheduler/tasks` and the
 * dev dashboard stay development-only; this is their production face, and it
 * reads the same stores rather than keeping a second copy.
 */
@Controller('studio/overview')
@AdminStudio()
export class StudioOverviewController {
  constructor(
    private readonly health: HealthRegistry,
    private readonly scheduler: ScheduledTaskStore,
  ) {}

  @RateLimit('read')
  @AdminSection({
    id: 'studio-health',
    title: 'Health',
    icon: 'activity',
    group: 'Operations',
    order: 1,
    columns: [
      { key: 'name', label: 'Check' },
      { key: 'probe', label: 'Probe', format: 'badge' },
      { key: 'status', label: 'Status', format: 'badge' },
      { key: 'durationMs', label: 'Duration (ms)', format: 'number' },
      { key: 'message', label: 'Message' },
    ],
  })
  @UnpaginatedRoute(
    'one row per registered health check, as long as the code that registers them',
  )
  @Get('health')
  @Capability(canReadStudioOverview)
  async healthChecks() {
    const reports = await Promise.all(
      PROBES.map(async (probe) => ({
        probe,
        report: await this.health.report(probe),
      })),
    );

    return ok(
      reports.flatMap(({ probe, report }) =>
        Object.entries(report.details).map(([name, state]) => ({
          id: probe + ':' + name,
          name,
          probe,
          status: state.status,
          durationMs: Math.round(state.durationMs),
          message: state.message ?? null,
        })),
      ),
    );
  }

  @RateLimit('read')
  @AdminSection({
    id: 'studio-scheduler',
    title: 'Scheduled tasks',
    icon: 'clock',
    group: 'Operations',
    order: 2,
    columns: [
      { key: 'name', label: 'Task' },
      { key: 'status', label: 'Last run', format: 'badge' },
      { key: 'lastRunAt', label: 'At', format: 'date' },
      { key: 'durationMs', label: 'Duration (ms)', format: 'number' },
      { key: 'errorMessage', label: 'Error' },
    ],
  })
  @UnpaginatedRoute(
    'the tasks registered in code, as long as the code that registers them',
  )
  @Get('scheduler')
  @Capability(canReadStudioOverview)
  scheduledTasks() {
    return ok(
      this.scheduler.list().map((run) => ({
        id: run.name,
        ...run,
        durationMs: Math.round(run.durationMs),
      })),
    );
  }

  @RateLimit('read')
  @AdminSection({
    id: 'studio-environment',
    title: 'Environment',
    icon: 'settings',
    group: 'Operations',
    order: 3,
    columns: [
      { key: 'setting', label: 'Setting' },
      { key: 'value', label: 'Value' },
    ],
  })
  @UnpaginatedRoute('a fixed handful of facts about the running process')
  @Get('environment')
  @Capability(canReadStudioOverview)
  environment() {
    const studio = adminStudioSettings();
    const facts: Array<[string, string]> = [
      ['NODE_ENV', process.env.NODE_ENV ?? 'unset'],
      ['Node.js', process.version],
      ['Uptime (s)', String(Math.round(process.uptime()))],
      ['Tenant', TenantContextStorage.getTenantId()],
      ['Studio enabled in production', String(studio.enabled)],
      ['Studio IP allowlist entries', String(studio.allowedIps.length)],
      ['Studio requires 2FA', String(studio.requireTwoFactor)],
    ];

    return ok(
      facts.map(([setting, value]) => ({ id: setting, setting, value })),
    );
  }
}
