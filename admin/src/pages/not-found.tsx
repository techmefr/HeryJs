import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <h1 className="text-4xl font-semibold text-orange-600">404</h1>
      <Link
        to="/feature-flags"
        className="text-sm text-neutral-500 underline hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
