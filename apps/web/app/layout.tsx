import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="ko" className="dark">
      <body className="min-h-screen bg-slate-900">{children}</body>
    </html>
  );
}
