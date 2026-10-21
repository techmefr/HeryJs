import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { HERY_CONFIG } from '#kernel/config/hery-config';
import type { HeryConfig } from '#kernel/config/hery-config.types';
import { RecordNotFoundException } from '#kernel/errors/record-not-found.exception';
import { HealthRegistry } from '#kernel/health/health-registry';
import type { HttpResponse } from '#kernel/http-client/http-client-driver';
import { HttpResilience } from '#kernel/http-client/http-resilience';
import type {
  CircuitSnapshot,
  HttpResilienceSettings,
} from '#kernel/http-client/http-resilience';
import { bindCircuitMetrics } from './http-resilience.metrics';

/**
 * The per-host circuit breaker and bulkhead in front of whichever driver is
 * active. It sits in the facade rather than in a driver so the fake driver is
 * held to exactly the same rules the real one is: a test that stubs a 503
 * opens the circuit the way production would.
 */
@Injectable()
export class HttpResilienceService implements OnModuleInit {
  private readonly resilience: HttpResilience;

  constructor(
    @Inject(HERY_CONFIG) config: HeryConfig,
    private readonly health: HealthRegistry,
  ) {
    this.resilience = new HttpResilience(config.httpClient?.resilience);
  }

  onModuleInit(): void {
    bindCircuitMetrics(this.resilience);

    if (!this.resilience.reportsInHealth) {
      return;
    }

    this.health.register({
      name: 'http-circuits',
      probes: ['readiness'],
      check: () => {
        const open = this.resilience
          .snapshots()
          .filter((snapshot) => snapshot.state === 'open')
          .map((snapshot) => snapshot.host);

        return open.length === 0
          ? Promise.resolve()
          : Promise.reject(
              new Error(`HTTP circuit open for ${open.join(', ')}`),
            );
      },
    });
  }

  run(url: string, call: () => Promise<HttpResponse>): Promise<HttpResponse> {
    return this.resilience.run(url, call);
  }

  circuits(): CircuitSnapshot[] {
    return this.resilience.snapshots();
  }

  open(host: string): CircuitSnapshot {
    const gate = this.require(host);
    gate.open();

    return gate.snapshot();
  }

  reset(host: string): CircuitSnapshot {
    const gate = this.require(host);
    gate.reset();

    return gate.snapshot();
  }

  configure(
    host: string,
    settings: Partial<HttpResilienceSettings>,
  ): CircuitSnapshot {
    this.require(host);
    this.resilience.configure(host, settings);

    return this.require(host).snapshot();
  }

  private require(host: string) {
    const gate = this.resilience.find(host);

    if (!gate) {
      throw new RecordNotFoundException('Circuit');
    }

    return gate;
  }
}
