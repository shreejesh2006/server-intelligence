import React from 'react';
import TopBar from './TopBar';
import Sidebar from './Sidebar';

export function AppShell({ children, isOffline, lastUpdated, onRefresh, loading }) {
  return (
    <div className="app-grid">
      <TopBar
        isOffline={isOffline}
        lastUpdated={lastUpdated}
        onRefresh={onRefresh}
        loading={loading}
      />
      <div className="app-body">
        <Sidebar />
        <main className="main-content">
          {children}
        </main>
      </div>
      <footer className="editorial-footer">
        <div className="footer-left">
          <span>SERVER INTELLIGENCE PLATFORM</span>
          <span className="footer-sep">/</span>
          <span>SYSTEM STATUS: OPERATIONAL</span>
          <span className="footer-sep">/</span>
          <span>VICTORIAMETRICS TELEMETRY</span>
        </div>
        <div className="footer-right">
          <span>BUILD 0.1.0-STABLE</span>
        </div>
      </footer>

      <style>{`
        .editorial-footer {
          height: var(--footer-height);
          background-color: var(--bg-surface);
          border-top: 1px solid var(--border-strong);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.05em;
          z-index: 5;
        }

        .footer-left, .footer-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .footer-sep {
          color: var(--border-strong);
        }
      `}</style>
    </div>
  );
}

export default AppShell;
