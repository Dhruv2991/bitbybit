import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="font-mono text-indigo-400 text-xs mb-3 font-medium">
          404 &mdash; Page Not Found
        </div>
        <h1 className="text-6xl font-bold tracking-tight text-zinc-100 mb-3">
          404
        </h1>
        <p className="font-mono text-xs text-zinc-400 mb-6">
          The page you requested does not exist or has been moved.
        </p>
        <Link href="/" className="inline-flex items-center justify-center px-4 py-2 text-xs font-mono font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
