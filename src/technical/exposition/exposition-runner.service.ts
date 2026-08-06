import { Injectable, NotFoundException } from '@nestjs/common';
import { writeAuditLog } from '#technical/audit/audit-log';
import { authPrismaClient } from '#technical/auth/better-auth.instance';
import type { AuthenticatedUser } from '#technical/auth/auth.types';
import { subjectOf } from '#technical/capabilities/subject';
import { CapabilityForbiddenException } from '#technical/errors/capability-forbidden.exception';
import { ExpositionEnvironmentBlockedException } from '#technical/errors/exposition-environment-blocked.exception';
import { InvalidQueryException } from '#technical/errors/invalid-query.exception';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import type { ExposedEnvironment, RegisteredAction } from './exposition.types';
import { ExpositionRegistry } from './exposition.registry';
import { schemaFor } from './exposition-validation';

function currentEnvironment(): ExposedEnvironment {
  const raw = process.env.NODE_ENV;
  return raw === 'production' || raw === 'test' ? raw : 'development';
}

@Injectable()
export class ExpositionRunner {
  constructor(private readonly registry: ExpositionRegistry) {}

  async run(
    actionName: string,
    params: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const action = this.checkEnvironment(actionName);

    const decision = action.capability(subjectOf(user));

    if (!decision.allowed) {
      throw new CapabilityForbiddenException(decision);
    }

    return this.resolveAndInvoke(action, params, {
      userId: user.id,
      impersonatedBy: TenantContextStorage.getImpersonatedBy(),
    });
  }

  /**
   * Reached only from the CLI, whose caller is the operator running the
   * process, not a signed-in user -- there is no subject to check the
   * action's capability against, so trust comes from having a shell on the
   * machine instead. The environment filter and the audit trail still apply.
   */
  async runTrusted(
    actionName: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const action = this.checkEnvironment(actionName);

    return this.resolveAndInvoke(action, params, {
      userId: null,
      impersonatedBy: null,
    });
  }

  private checkEnvironment(actionName: string): RegisteredAction {
    const action = this.registry.get(actionName);

    if (!action) {
      throw new NotFoundException();
    }

    if (
      action.environments &&
      !action.environments.includes(currentEnvironment())
    ) {
      throw new ExpositionEnvironmentBlockedException(actionName);
    }

    return action;
  }

  private async resolveAndInvoke(
    action: RegisteredAction,
    params: Record<string, unknown>,
    actor: { userId: string | null; impersonatedBy: string | null },
  ): Promise<unknown> {
    const resolved = action.params.map((param) => {
      const provided = params[param.name];
      const value = provided === undefined ? param.spec.default : provided;
      const result = schemaFor(param.spec).safeParse(value);

      if (!result.success) {
        throw new InvalidQueryException(
          param.name,
          result.error.issues.map((issue) => issue.message),
        );
      }

      return result.data;
    });

    await writeAuditLog(authPrismaClient, {
      tenantId: TenantContextStorage.getTenantId(),
      model: 'exposition',
      operation: action.name,
      recordId: null,
      data: Object.fromEntries(
        action.params.map((param, index) => [param.name, resolved[index]]),
      ),
      userId: actor.userId,
      impersonatedBy: actor.impersonatedBy,
    });

    return action.invoke(resolved);
  }
}
