export interface PlaygroundStep {
  stage: 'middleware' | 'guard' | 'controller' | 'prisma';
  label: string;
  status: 'ok' | 'blocked' | 'error';
  durationMs?: number;
  detail?: unknown;
}

export interface PlaygroundScenario {
  id: string;
  label: string;
  method: string;
  path: string;
  request: string;
  response: string;
  flow: PlaygroundStep[];
}
