'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import {
  Dice5,
  BookOpen,
  Settings,
  LogOut,
  LayoutDashboard,
  Menu,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/rulebooks', label: '규칙서', icon: BookOpen },
  { href: '/settings', label: '설정', icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      toast.success('로그아웃되었습니다');
      router.push('/login');
    } catch {
      toast.error('로그아웃에 실패했습니다');
    }
  };

  return (
    <div className="flex min-h-screen bg-bg-base">
      {/* 사이드바 (데스크톱) — 220px */}
      <aside className="w-[220px] bg-bg-surface border-r border-line-default hidden md:flex md:flex-col">
        <div className="p-5">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Dice5 size={24} className="text-gold" />
            <h1 className="font-serif text-lg font-bold text-gold">
              Auto TRPG
            </h1>
          </Link>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-body-sm font-medium transition-all ${
                  isActive
                    ? 'bg-gold/10 text-gold'
                    : 'text-text-secondary hover:bg-bg-overlay hover:text-text-primary'
                }`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 mt-auto space-y-1">
          {/* 다크/라이트 모드 토글 */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-md text-body-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary transition-colors"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? '라이트 모드' : '다크 모드'}</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-md text-body-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary transition-colors"
          >
            <LogOut size={18} />
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      {/* 모바일 헤더 */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-bg-surface border-b border-line-default">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Dice5 size={20} className="text-gold" />
            <span className="font-serif text-base font-bold text-gold">Auto TRPG</span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-md text-text-secondary hover:bg-bg-overlay transition-colors"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md text-text-secondary hover:bg-bg-overlay transition-colors"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </header>

        {/* 모바일 메뉴 드롭다운 */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-bg-surface border-b border-line-default px-4 py-2 space-y-1 animate-fade-in">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-body-sm transition-colors ${
                    isActive
                      ? 'bg-gold/10 text-gold'
                      : 'text-text-secondary hover:bg-bg-overlay hover:text-text-primary'
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 w-full rounded-md text-body-sm text-text-secondary hover:bg-bg-overlay hover:text-text-primary transition-colors"
            >
              <LogOut size={18} />
              <span>로그아웃</span>
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
