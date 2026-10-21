import type { ResourceExtension, AdminExtensions } from './extensions';
import type { DescribedController } from './api';
import type { QueryState } from './query';
import type { ResourceDescription, SearchOutcome } from './resource';

export interface MountOptions {
  base: string;
  controllers: DescribedController[];
  extensions: AdminExtensions;
  editId?: string | null;
  confirm?: (message: string) => boolean;
}

export interface View {
  options: MountOptions;
  description: ResourceDescription;
  extension: ResourceExtension;
  capabilityKeys: string[];
  query: QueryState;
  outcome: SearchOutcome;
  selected: Set<string>;
  notice: HTMLElement;
  table: HTMLElement;
  bulk: HTMLElement;
  pager: HTMLElement;
  root: HTMLElement;
}

export function announce(view: View, message: string, isError: boolean): void {
  view.notice.className = isError ? 'form-error' : 'form-help';
  view.notice.setAttribute('role', isError ? 'alert' : 'status');
  view.notice.textContent = message;
}

export function confirmed(view: View, message: string): boolean {
  return (view.options.confirm ?? ((text) => window.confirm(text)))(message);
}
