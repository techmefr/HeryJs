import { useLogout } from '@refinedev/core';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { BellIcon, DatabaseIcon, FlagIcon, ShieldCheckIcon } from './icons';

const NAV_ITEMS = [
  { to: '/feature-flags', label: 'Feature flags', Icon: FlagIcon },
  { to: '/audit', label: 'Audit log', Icon: ShieldCheckIcon },
  { to: '/notifications', label: 'Notifications', Icon: BellIcon },
  { to: '/seeders', label: 'Seeders', Icon: DatabaseIcon },
];

export function Layout({ children }: { children: ReactNode }) {
  const { mutate: logout } = useLogout();

  return (
    <div className="flex min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <aside className="w-56 shrink-0 border-r border-neutral-200 p-4 dark:border-neutral-800">
        <h1 className="mb-6 text-lg font-semibold tracking-tight">
          HeryJs Admin
        </h1>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded px-3 py-2 text-sm ${
                  isActive
                    ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white'
                    : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-200'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => logout()}
          className="mt-8 w-full rounded px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-900 dark:hover:text-neutral-300"
        >
          Log out
        </button>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
