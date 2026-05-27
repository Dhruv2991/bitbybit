import type { Metadata } from 'next';
import { JetBrains_Mono, Syne } from 'next/font/google';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${syne.variable}`} suppressHydrationWarning>
      <body className="bg-[#0a0a0a] text-[#e0e0e0] min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
