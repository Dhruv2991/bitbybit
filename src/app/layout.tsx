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
  title: 'BitByBit — TeamCodeLocked',
  description: 'The private arena for TeamCodeLocked — solve daily problems, compete in proctored contests.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${syne.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try {
              var t = localStorage.getItem('bb_theme');
              if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
            } catch (e) {}`,
          }}
        />
      </head>
      <body className="bg-[#0a0a0a] text-[#e0e0e0] min-h-screen antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}