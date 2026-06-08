import React, { useState, createContext, useContext } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

// ── Shared collapse context ────────────────────────────────────
interface SidebarCtx { collapsed: boolean; toggle: () => void; }
export const SidebarContext = createContext<SidebarCtx>({ collapsed: false, toggle: () => {} });
export const useSidebar = () => useContext(SidebarContext);

interface LayoutProps { children: React.ReactNode; }

export function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const toggle = () => setCollapsed(v => !v);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <TopBar />
        <main className={`${collapsed ? 'ml-[64px]' : 'ml-[190px]'} pt-16 transition-all duration-200`}>
          {children}
        </main>
      </div>
    </SidebarContext.Provider>
  );
}