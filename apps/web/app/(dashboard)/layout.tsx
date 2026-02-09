'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: '🎲' },
  { href: '/rulebooks', label: '규칙서', icon: '📖' },
  { href: '/settings', label: '설정', icon: '⚙️' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      {/* 사이드바 */}
      <aside className="w-64 bg-slate-800 border-r border-slate-700 p-4 hidden md:block">
        <div className="mb-8">
          <Link href="/dashboard">
            <h1 className="text-xl font-bold text-amber-400 text-shadow">
              Auto TRPG
            </h1>
          </Link>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-600/20 text-primary-400'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-slate-100'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-4 left-4 right-4">
          <button className="btn-secondary w-full text-sm">로그아웃</button>
        </div>
      </aside>

      {/* 모바일 헤더 */}
      <div className="flex-1 flex flex-col">
        <header className="md:hidden flex items-center justify-between p-4 bg-slate-800 border-b border-slate-700">
          <h1 className="text-lg font-bold text-amber-400">Auto TRPG</h1>
          <nav className="flex gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-slate-300 hover:text-slate-100 p-2"
              >
                <span>{item.icon}</span>
              </Link>
            ))}
          </nav>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
