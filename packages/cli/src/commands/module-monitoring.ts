import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';

const COMPOSE_FILE = 'docker-compose.monitoring.yml';
const PROMETHEUS_CONFIG_DIR = 'monitoring';
const API_KEY_FILE = 'api-key';

const COMPOSE_CONTENT = `services:
  prometheus:
    image: prom/prometheus:v2.55.1
    restart: unless-stopped
    ports:
      - '9090:9090'
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./monitoring/api-key:/etc/prometheus/api-key:ro
      - heryjs-prometheus:/prometheus

  loki:
    image: grafana/loki:3.2.1
    restart: unless-stopped
    ports:
      - '3100:3100'
    command: -config.file=/etc/loki/local-config.yaml

  grafana:
    image: grafana/grafana:11.3.1
    restart: unless-stopped
    ports:
      - '3001:3000'
    environment:
      GF_AUTH_ANONYMOUS_ENABLED: 'true'
      GF_AUTH_ANONYMOUS_ORG_ROLE: 'Admin'
    volumes:
      - heryjs-grafana:/var/lib/grafana

volumes:
  heryjs-prometheus:
  heryjs-grafana:
`;

const PROMETHEUS_CONFIG = `global:
  scrape_interval: 15s

scrape_configs:
  - job_name: heryjs
    metrics_path: /metrics
    # /metrics carries every route of the application with its request counts,
    # so it is caller-authenticated like any other route. A scrape has no
    # session: it authenticates with an admin API key, read from the mounted
    # file rather than written here.
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/api-key
    static_configs:
      - targets: ['host.docker.internal:3000']
`;

const API_KEY_PLACEHOLDER = `replace-this-line-with-an-admin-api-key
`;

export function registerModuleMonitoringCommand(program: Command): void {
  program
    .command('module:monitoring')
    .description(
      'Scaffold Prometheus + Grafana + Loki as an opt-in local stack',
    )
    .action(() => {
      if (existsSync(COMPOSE_FILE)) {
        console.log(pc.yellow(`${COMPOSE_FILE} already exists, skipping.`));
        return;
      }

      mkdirSync(PROMETHEUS_CONFIG_DIR, { recursive: true });
      writeFileSync(
        path.join(PROMETHEUS_CONFIG_DIR, 'prometheus.yml'),
        PROMETHEUS_CONFIG,
      );

      const apiKeyFile = path.join(PROMETHEUS_CONFIG_DIR, API_KEY_FILE);

      if (!existsSync(apiKeyFile)) {
        writeFileSync(apiKeyFile, API_KEY_PLACEHOLDER);
      }

      writeFileSync(COMPOSE_FILE, COMPOSE_CONTENT);

      console.log(
        pc.green(
          `✔ Wrote ${COMPOSE_FILE}, monitoring/prometheus.yml and monitoring/${API_KEY_FILE}`,
        ),
      );
      console.log(
        `The scrape authenticates: mint an admin key with POST /api-keys and put it in monitoring/${API_KEY_FILE}, on its own line. Until then Prometheus gets a 401 on every scrape.`,
      );
      console.log('Nothing is running yet. Start it with:');
      console.log(
        pc.dim(
          `  docker compose -f docker-compose.yml -f ${COMPOSE_FILE} up -d prometheus grafana loki`,
        ),
      );
      console.log(
        'Then open Grafana at http://localhost:3001 and Prometheus at http://localhost:9090.',
      );
    });
}
