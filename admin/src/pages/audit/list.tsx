import { useEffect, useState } from 'react';
import { apiFetch } from '../../api-fetch';

interface AuditLogEntry {
  id: string;
  model: string;
  operation: string;
  recordId: string;
  createdAt: string;
}

export function AuditList() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [chainValid, setChainValid] = useState<boolean | null>(null);

  useEffect(() => {
    apiFetch('/audit-logs').then((body) => setEntries(body.data));
    apiFetch('/audit-logs/verify').then((body) => setChainValid(body.data.valid));
  }, []);

  if (!entries) {
    return <p className="text-neutral-400">Loading...</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-xl font-semibold">Audit log</h1>
        {chainValid === null ? null : chainValid ? (
          <span className="rounded-full bg-emerald-950 px-3 py-1 text-xs text-emerald-400">
            Chain valid
          </span>
        ) : (
          <span className="rounded-full bg-red-950 px-3 py-1 text-xs text-red-400">
            Chain tampered
          </span>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-neutral-400">No audit entries yet.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Model</th>
                <th className="px-4 py-2 font-medium">Operation</th>
                <th className="px-4 py-2 font-medium">Record</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-neutral-800">
                  <td className="px-4 py-2 text-neutral-400">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-mono">{entry.model}</td>
                  <td className="px-4 py-2">{entry.operation}</td>
                  <td className="px-4 py-2 font-mono text-neutral-500">
                    {entry.recordId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
