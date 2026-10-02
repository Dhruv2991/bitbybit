import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="font-mono text-cyan-400 text-xs mb-3 font-semibold">
          404 &mdash; Page Not Found
        </div>
        <h1 className="text-6xl font-bold tracking-tight text-zinc-100 mb-3">
          404
        </h1>
        <p className="font-mono text-xs text-zinc-400 mb-6">
          The page you requested does not exist or has been moved.
        </p>
        <Link href="/" className="inline-flex items-center justify-center px-4 py-2 text-xs font-mono font-bold rounded-lg bg-gradient-to-r from-cyan-400 to-cyan-500 text-zinc-950 shadow-[0_0_15px_rgba(0,229,255,0.25)] hover:opacity-90 transition-all">
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
