import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <p className="text-sm font-medium text-orange-600">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        This page doesn't exist or you don't have access to it.
      </p>
      <Link
        to="/feature-flags"
        className="mt-4 rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
