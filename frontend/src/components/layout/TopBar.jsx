import React from 'react';
import { Activity, Server, RefreshCw, WifiOff, Sun, Moon, LogOut, Shield } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useServer } from '../../context/ServerContext';

export function TopBar({ isOffline, lastUpdated, onRefresh, loading, freshnessState = 'FRESH', freshnessLabel = 'TELEMETRY FRESH' }) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { formatTimestamp } = useTimezone();
  const { servers = [], selectedHost, selectServer } = useServer();

  const formattedTime = lastUpdated
    ? formatTimestamp(Math.floor(lastUpdated.getTime() / 1000), true)
    : 'INITIALIZING...';

  let pillClass = 'pill-healthy';
  if (freshnessState === 'OFFLINE' || isOffline) {
    pillClass = 'pill-critical';
  } else if (freshnessState === 'STALE') {
    pillClass = 'pill-warning';
  }

  const isDarkMode = theme === 'dark';

  return (
    <header className="neo-topbar font-mono">
      <div className="topbar-left">
        <div className="brand">
          <div className="brand-logo-box">
            <Activity className="brand-icon" size={15} />
          </div>
          <div className="brand-text font-sans">
            <span className="brand-title">SERVER INTELLIGENCE</span>
            <span className="brand-tag font-mono">v0.1.0-INDUSTRIAL</span>
          </div>
        </div>
      </div>

      <div className="topbar-right">
        {/* Prominent Multi-Server Selector Control */}
        <div className="neo-server-selector">
          <Server size={13} className="text-accent" />
          <span className="selector-label text-tertiary">NODE:</span>
          <select
            value={selectedHost || 'ubuntu'}
            onChange={(e) => selectServer && selectServer(e.target.value)}
            aria-label="Select target server"
            className="neo-server-select"
          >
            {servers.map((srv) => (
              <option key={srv.host} value={srv.host}>
                {String(srv.name || srv.host).toUpperCase()} ({srv.ip})
              </option>
            ))}
          </select>
        </div>

        <div className="topbar-divider" />

        {/* Live / Stale / Offline Freshness Status */}
        <div>
          {isOffline || freshnessState === 'OFFLINE' ? (
            <span className="editorial-pill pill-critical">
              <WifiOff size={11} /> API OFFLINE
            </span>
          ) : (
            <span className={`editorial-pill ${pillClass}`}>
              <span className={`live-dot ${freshnessState === 'STALE' ? 'dot-stale' : ''}`} />
              {freshnessLabel}
            </span>
          )}
        </div>

        <div className="topbar-divider" />

        {/* Refresh Indicator & Timestamp */}
        <div className="topbar-item text-xs text-secondary">
          <span className="timestamp-text">UPDATED: {formattedTime}</span>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh telemetry metrics"
            className={`neo-icon-btn ${loading ? 'spinning' : ''}`}
            title="Refresh metrics"
          >
            <RefreshCw size={12} />
          </button>
        </div>

        <div className="topbar-divider" />

        {/* Light & Dark Theme Mode Toggle Button */}
        <div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${isDarkMode ? 'Light' : 'Dark'} mode`}
            className="neo-btn theme-toggle-btn"
            title={`Switch to ${isDarkMode ? 'Light' : 'Dark'} mode`}
          >
            {isDarkMode ? <Moon size={12} /> : <Sun size={12} />}
            <span>{isDarkMode ? 'DARK' : 'LIGHT'}</span>
          </button>
        </div>

        <div className="topbar-divider" />

        {/* User Profile & Sign Out */}
        <div className="user-profile-box">
          <Shield size={13} className="text-secondary" />
          <span className="user-name-text text-xs">{user?.username || 'GUEST'}</span>
          {user?.role && (
            <span className={`editorial-pill ${user.role === 'ADMIN' ? 'pill-healthy' : 'pill-neutral'}`}>
              {user.role}
            </span>
          )}
          <button
            type="button"
            onClick={logout}
            aria-label="Sign Out and terminate session"
            className="neo-icon-btn logout-btn"
            title="Sign Out / Terminate Session"
          >
            <LogOut size={12} />
          </button>
        </div>
      </div>

      <style>{`
        .neo-topbar {
          height: var(--topbar-height);
          background-color: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          flex-shrink: 0;
          z-index: 10;
        }

        .topbar-left, .topbar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .brand-logo-box {
          width: 30px;
          height: 30px;
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .brand-icon {
          color: var(--accent);
        }

        .brand-text {
          display: flex;
          flex-direction: column;
        }

        .brand-title {
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 0.04em;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .brand-tag {
          font-size: 9px;
          color: var(--text-tertiary);
          letter-spacing: 0.05em;
        }

        .topbar-divider {
          width: 1px;
          height: 16px;
          background-color: var(--border-subtle);
        }

        .topbar-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .timestamp-text {
          font-size: 10px;
          color: var(--text-tertiary);
        }

        .neo-server-selector {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 0 8px;
          height: 32px;
        }

        .selector-label {
          font-size: 10px;
          letter-spacing: 0.05em;
        }

        .neo-server-select {
          background: transparent;
          color: var(--accent);
          border: none;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.03em;
          cursor: pointer;
          outline: none;
        }

        .theme-toggle-btn {
          height: 32px;
          padding: 0 10px;
          font-size: 10px;
        }

        .user-profile-box {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .user-name-text {
          font-weight: 600;
          color: var(--text-primary);
        }

        .neo-icon-btn {
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          color: var(--text-tertiary);
          cursor: pointer;
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }

        .neo-icon-btn:hover {
          color: var(--accent);
          border-color: var(--accent-border);
          background: var(--bg-surface-hover);
        }

        .logout-btn:hover {
          color: var(--status-critical);
          border-color: rgba(220, 38, 38, 0.3);
        }

        .live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: var(--status-healthy);
          display: inline-block;
        }

        .dot-stale {
          background-color: var(--status-warning);
        }

        .text-xs {
          font-size: 11px;
        }
      `}</style>
    </header>
  );
}

export default TopBar;
