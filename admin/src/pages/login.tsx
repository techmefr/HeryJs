import { useLogin } from '@refinedev/core';
import { useState } from 'react';

export function LoginPage() {
  const { mutate: login, isPending, error } = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="flex min-h-screen items-center justify-center bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          login({ email, password });
        }}
        className="w-80 rounded-lg border border-neutral-200 bg-neutral-50 p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        <h1 className="mb-6 text-lg font-semibold">HeryJs Admin</h1>

        <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mb-4 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 dark:border-neutral-700 dark:bg-neutral-800"
        />

        <label className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mb-4 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 dark:border-neutral-700 dark:bg-neutral-800"
        />

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded bg-orange-600 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
        >
          Log in
        </button>

        <button
          type="button"
          disabled
          title="Not configured yet"
          className="mt-2 w-full rounded border border-neutral-300 py-2 text-sm text-neutral-500 dark:border-neutral-700"
        >
          Continue with OAuth
        </button>

        {error ? (
          <p className="mt-3 text-xs text-red-500 dark:text-red-400">
            {error.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
