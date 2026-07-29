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
    <tr>
      <td>{flag.key}</td>
      <td>
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
        >
          <option value="invisible">Invisible</option>
          <option value="everyone">Tout le monde</option>
          <option value="beta">Tenant - beta test</option>
          <option value="other">Autre</option>
        </select>
        {selectedKind === 'other' ? (
          <span style={{ marginLeft: 8 }}>
            <input
              value={customTenantId}
              placeholder="tenant id"
              onChange={(event) => setCustomTenantId(event.target.value)}
            />
            <button
              type="button"
              onClick={() => apply('other', customTenantId)}
              disabled={!customTenantId}
            >
              Set
            </button>
          </span>
        ) : null}
      </td>
    </tr>
  );
}

export function FeatureFlagsList() {
  const { result, query } = useList<FeatureFlag>({ resource: 'feature-flags' });

  if (query.isLoading) {
    return <p>Loading...</p>;
  }

  return (
    <div style={{ maxWidth: 720, margin: '40px auto' }}>
      <h1>Feature flags</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Key</th>
            <th style={{ textAlign: 'left' }}>Visible for</th>
          </tr>
        </thead>
        <tbody>
          {result?.data.map((flag) => <FlagRow key={flag.id} flag={flag} />)}
        </tbody>
      </table>
    </div>
  );
}
