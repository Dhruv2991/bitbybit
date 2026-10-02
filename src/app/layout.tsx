import type { Metadata } from 'next';
import { JetBrains_Mono, Syne } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
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
  metadataBase: new URL('https://bitbybit-9h8e.vercel.app'),
  title: {
    default: 'BitByBit — TeamCodeLocked',
    template: '%s · BitByBit',
  },
  description: 'The private arena for TeamCodeLocked — solve daily problems, compete in proctored contests, and climb the leaderboard.',
  keywords: ['competitive programming', 'coding practice', 'coding contests', 'DSA problems', 'TeamCodeLocked', 'BitByBit'],
  openGraph: {
    title: 'BitByBit — TeamCodeLocked',
    description: 'The private arena for TeamCodeLocked — solve daily problems, compete in proctored contests, and climb the leaderboard.',
    url: 'https://bitbybit-9h8e.vercel.app',
    siteName: 'BitByBit',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BitByBit — TeamCodeLocked',
    description: 'The private arena for TeamCodeLocked — solve daily problems, compete in proctored contests, and climb the leaderboard.',
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'BitByBit',
  },
};

export const viewport = {
  themeColor: '#0b0d12',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`dark ${jetbrainsMono.variable} ${syne.variable}`}>
      <body className="bg-[var(--bg)] text-[var(--text)] min-h-screen antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
