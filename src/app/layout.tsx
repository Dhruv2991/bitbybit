import type { Metadata } from 'next';
import { JetBrains_Mono, Syne } from 'next/font/google';
import { Suspense } from 'react';
import './globals.css';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BitByBit — TeamCodeLocked',
  description: 'The private arena for TeamCodeLocked — solve daily problems, compete in proctored contests.',
};

function GlobalLoader() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <img 
          src="/logo.png" 
          alt="BitByBit" 
          className="w-28 h-28 object-contain animate-pulse"
        />
        <div className="w-32 h-[1px] bg-[#1a1a1a] overflow-hidden rounded">
          <div className="h-full w-1/2 bg-[#00e87a] animate-[slide_1s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${syne.variable}`} suppressHydrationWarning>
      <body className="bg-[#0a0a0a] text-[#e0e0e0] min-h-screen antialiased">
        <Suspense fallback={<GlobalLoader />}>
          {children}
        </Suspense>
      </body>
    </html>
  );
}