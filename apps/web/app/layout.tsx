import type { Metadata } from 'next';
import { Inter, Crimson_Pro, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const crimsonPro = Crimson_Pro({
  subsets: ['latin'],
  variable: '--font-crimson',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Auto TRPG - AI 게임 마스터',
  description: 'AI가 운영하는 탁상 롤플레잉 게임 플랫폼',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} ${crimsonPro.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-md)',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
