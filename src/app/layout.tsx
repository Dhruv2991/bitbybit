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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#08090d' },
  ],
};

const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('bb_theme');
    var isDark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = isDark ? 'dark' : 'light';
    var root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
    root.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${jetbrainsMono.variable} ${syne.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-[var(--bg)] text-[var(--text)] min-h-screen antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
