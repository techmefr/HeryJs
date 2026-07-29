import { useList, useUpdate } from '@refinedev/core';
import { useState } from 'react';

interface FeatureFlag {
  id: string;
  key: string;
  tenantId: string | null;
  enabled: boolean;
}

const BETA_TENANT_ID = 'beta-test';

type Target =
  | { kind: 'invisible' }
  | { kind: 'everyone' }
  | { kind: 'beta' }
  | { kind: 'other'; tenantId: string };

function targetFor(flag: FeatureFlag): Target {
  if (!flag.enabled) {
    return { kind: 'invisible' };
  }
  if (flag.tenantId === null) {
    return { kind: 'everyone' };
  }
  if (flag.tenantId === BETA_TENANT_ID) {
    return { kind: 'beta' };
  }
  return { kind: 'other', tenantId: flag.tenantId };
}

function FlagRow({ flag }: { flag: FeatureFlag }) {
  const { mutate: update } = useUpdate();
  const target = targetFor(flag);
  const [pendingKind, setPendingKind] = useState<Target['kind'] | null>(null);
  const selectedKind = pendingKind ?? target.kind;
  const [customTenantId, setCustomTenantId] = useState(
    target.kind === 'other' ? target.tenantId : '',
  );

  function apply(kind: Target['kind'], tenantId?: string) {
    setPendingKind(null);

    if (kind === 'invisible') {
      update({
        resource: 'feature-flags',
        id: flag.key,
        values: { enabled: false, tenantId: null },
      });
      return;
    }
    if (kind === 'everyone') {
      update({
        resource: 'feature-flags',
        id: flag.key,
        values: { enabled: true, tenantId: null },
      });
      return;
    }
    if (kind === 'beta') {
      update({
        resource: 'feature-flags',
        id: flag.key,
        values: { enabled: true, tenantId: BETA_TENANT_ID },
      });
      return;
    }
    if (tenantId) {
      update({
        resource: 'feature-flags',
        id: flag.key,
        values: { enabled: true, tenantId },
      });
    }
  }

  return (
    <tr className="border-b border-neutral-200 dark:border-neutral-800">
      <td className="py-3 pr-4 font-mono text-sm">{flag.key}</td>
      <td className="py-3">
        <div className="flex items-center gap-2">
          <select
            value={selectedKind}
            onChange={(event) => {
              const kind = event.target.value as Target['kind'];
              if (kind === 'other') {
                setPendingKind('other');
              } else {
                apply(kind);
              }
            }}
            className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-orange-500 dark:border-neutral-700 dark:bg-neutral-800"
          >
            <option value="invisible">Invisible</option>
            <option value="everyone">Tout le monde</option>
            <option value="beta">Tenant - beta test</option>
            <option value="other">Autre</option>
          </select>
          {selectedKind === 'other' ? (
            <>
              <input
                value={customTenantId}
                placeholder="tenant id"
                onChange={(event) => setCustomTenantId(event.target.value)}
                className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-orange-500 dark:border-neutral-700 dark:bg-neutral-800"
              />
              <button
                type="button"
                onClick={() => apply('other', customTenantId)}
                disabled={!customTenantId}
                className="rounded bg-orange-600 px-3 py-1.5 text-sm text-white hover:bg-orange-500 disabled:opacity-50"
              >
                Set
              </button>
            </>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export function FeatureFlagsList() {
  const { result, query } = useList<FeatureFlag>({ resource: 'feature-flags' });

  if (query.isLoading) {
    return (
      <p className="text-neutral-500 dark:text-neutral-400">Loading...</p>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Feature flags</h1>
      {result?.data.length ? (
        <table className="w-full max-w-2xl border-collapse">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-xs uppercase text-neutral-500 dark:border-neutral-700">
              <th className="pb-2 pr-4 font-medium">Key</th>
              <th className="pb-2 font-medium">Visible for</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((flag) => (
              <FlagRow key={flag.id} flag={flag} />
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-neutral-500">No feature flags yet.</p>
      )}
    </div>
  );
}
