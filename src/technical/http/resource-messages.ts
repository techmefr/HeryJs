type ResourceAction = 'created' | 'updated' | 'deleted' | 'restored';

const ACTION_LABELS: Record<ResourceAction, string> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  restored: 'restored',
};

export function resourceMessage(
  resource: string,
  action: ResourceAction,
): string {
  return `${resource} ${ACTION_LABELS[action]}.`;
}
