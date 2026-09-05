import React, { useState } from 'react';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import { FloatingChatbot } from '../chat/FloatingChatbot';
import { SettingsModal } from '../common/SettingsModal';

export function AppShell({ children, isOffline, lastUpdated, onRefresh, loading, freshnessState, freshnessLabel }) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="app-grid font-sans">
      <div className="app-outer-shell">
        <TopBar
          isOffline={isOffline}
          lastUpdated={lastUpdated}
          onRefresh={onRefresh}
          loading={loading}
          freshnessState={freshnessState}
          freshnessLabel={freshnessLabel}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
        <div className="app-body">
          <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />
          <main className="main-content">
            {children}
          </main>
        </div>
        <FloatingChatbot />
        <SettingsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
        />

        {/* STATIC BOTTOM BAR */}
        <footer className="neo-footer font-mono">
          <div className="footer-left">
            <span className="text-accent font-bold">SERVER INTELLIGENCE</span>
            <span className="footer-sep">/</span>
            <span>SYSTEM STATUS: OPERATIONAL</span>
            <span className="footer-sep">/</span>
            <span>VICTORIAMETRICS & ML ENGINE</span>
          </div>
          <div className="footer-right">
            <span className="editorial-pill pill-neutral">v0.1.0 INDUSTRIAL</span>
          </div>
        </footer>
      </div>

      <style>{`
        .neo-footer {
          position: static;
          height: var(--footer-height);
          background-color: var(--bg-surface);
          border-top: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.05em;
          flex-shrink: 0;
        }

        .footer-left, .footer-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .footer-sep {
          color: var(--border-strong);
        }
      `}</style>
    </div>
  );
}

export default AppShell;
