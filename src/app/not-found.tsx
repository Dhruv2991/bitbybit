import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="font-mono text-[#00e87a] text-sm mb-3 opacity-70">
          $ cd /this-page
        </div>
        <h1 className="font-display font-extrabold text-7xl text-[#f1f3f8] mb-2 glow-text">
          404
        </h1>
        <p className="font-mono text-sm text-[#666] mb-1">
          bash: page: command not found
        </p>
        <p className="font-mono text-xs text-[#4a5268] mb-8">
          Whatever you're looking for isn't at this address.
        </p>
        <Link href="/" className="btn-primary inline-block">
          $ cd ~
        </Link>
      </div>
    </div>
  );
}
