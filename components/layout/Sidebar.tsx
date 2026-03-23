'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HelpModal } from './HelpModal';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: '◆' },
  { href: '/screener', label: 'Screener', icon: '⊞' },
  { href: '/watchlist', label: 'Watchlist', icon: '★' },
  { href: '/signals', label: 'Signals', icon: '⚡' },
  { href: '/guide', label: 'Guide', icon: '◈' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const isStockPage = pathname.startsWith('/stock/');

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-bg-secondary border border-border rounded-lg p-2 text-text-secondary hover:text-text-primary transition-colors"
        aria-label="Open menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <SidebarContent pathname={pathname} isStockPage={isStockPage} onClose={() => setMobileOpen(false)} onHelpOpen={() => { setMobileOpen(false); setHelpOpen(true); }} />
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <SidebarContent pathname={pathname} isStockPage={isStockPage} onHelpOpen={() => setHelpOpen(true)} />
      </div>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

function SidebarContent({ pathname, isStockPage, onClose, onHelpOpen }: {
  pathname: string; isStockPage: boolean; onClose?: () => void; onHelpOpen?: () => void;
}) {
  return (
    <aside className="fixed left-0 top-0 h-full w-56 bg-bg-secondary border-r border-border flex flex-col z-50">
      <div className="px-5 py-6 border-b border-border flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2" onClick={onClose}>
          <span className="text-green font-display text-lg font-bold tracking-tight">SENTINEL</span>
        </Link>
        {onClose && (
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary text-xl lg:hidden">×</button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const isActive = href === '/'
            ? pathname === '/'
            : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-bg-tertiary text-text-primary font-medium'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50'
              }`}
            >
              <span className="text-base w-5 text-center">{icon}</span>
              {label}
            </Link>
          );
        })}

        {isStockPage && (
          <div className="pt-2 mt-2 border-t border-border">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm bg-bg-tertiary text-text-primary font-medium">
              <span className="text-base w-5 text-center">◉</span>
              {pathname.split('/').pop()?.toUpperCase()}
            </div>
          </div>
        )}
      </nav>

      <div className="px-3 pb-2 space-y-0.5">
        <button
          onClick={onHelpOpen}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50 transition-colors cursor-pointer"
        >
          <span className="text-base w-5 text-center">?</span>
          Getting Started
        </button>
        <Link
          href="/admin"
          onClick={onClose}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            pathname === '/admin'
              ? 'bg-bg-tertiary text-text-primary font-medium'
              : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50'
          }`}
        >
          <span className="text-base w-5 text-center">⚙</span>
          System
        </Link>
      </div>

      <div className="px-5 py-4 border-t border-border">
        <p className="text-text-tertiary text-[10px] font-display">v0.5.0 · Sprint 5</p>
      </div>
    </aside>
  );
}
