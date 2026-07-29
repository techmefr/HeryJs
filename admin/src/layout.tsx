import { useLogout } from '@refinedev/core';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/feature-flags', label: 'Feature flags' },
  { to: '/audit', label: 'Audit log' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/seeders', label: 'Seeders' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { mutate: logout } = useLogout();

  return (
    <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
      <aside className="w-56 shrink-0 border-r border-neutral-800 p-4">
        <h1 className="mb-6 text-lg font-semibold tracking-tight">
          HeryJs Admin
        </h1>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded px-3 py-2 text-sm ${
                  isActive
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => logout()}
          className="mt-8 w-full rounded px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300"
        >
          Log out
        </button>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
