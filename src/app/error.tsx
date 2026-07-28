'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="font-mono text-[#ff5c6c] text-sm mb-3 opacity-70">
          $ ./bitbybit --run
        </div>
        <h1 className="font-display font-extrabold text-4xl text-[#f1f3f8] mb-3">
          Something broke
        </h1>
        <p className="font-mono text-sm text-[#666] mb-1">
          An unexpected error stopped this page from loading.
        </p>
        {error.digest && (
          <p className="font-mono text-[11px] text-[#4a5268] mb-8">
            Reference: {error.digest}
          </p>
        )}
        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={() => reset()} className="btn-primary">
            ↻ Try again
          </button>
          <a href="/" className="btn-ghost">
            $ cd ~
          </a>
        </div>
      </div>
    </div>
  );
}
