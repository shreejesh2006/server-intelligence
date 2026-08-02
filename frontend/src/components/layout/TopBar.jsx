import React from 'react';
import { Activity, Server, RefreshCw, User, WifiOff, Sun, Moon, LogOut } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTimezone } from '../../context/TimezoneContext';

export function TopBar({ isOffline, lastUpdated, onRefresh, loading, freshnessState = 'FRESH', freshnessLabel = 'TELEMETRY FRESH' }) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { formatTimestamp } = useTimezone();

  const formattedTime = lastUpdated
    ? formatTimestamp(Math.floor(lastUpdated.getTime() / 1000), true)
    : 'INITIALIZING...';

  // Determine freshness pill style
  let pillClass = 'pill-healthy';
  if (freshnessState === 'OFFLINE' || isOffline) {
    pillClass = 'pill-critical';
  } else if (freshnessState === 'STALE') {
    pillClass = 'pill-warning';
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand">
          <Activity className="brand-icon" size={16} />
          <span className="brand-title">SERVER INTELLIGENCE</span>
          <span className="brand-tag">v0.1.0</span>
        </div>
      </div>

      <div className="topbar-right">
        {/* Host Badge */}
        <div className="topbar-item">
          <Server size={13} className="text-secondary" />
          <span className="font-mono text-xs">HOST: ubuntu-primary</span>
        </div>

        <div className="topbar-divider" />

        {/* Live / Stale / Offline Freshness Status */}
        <div className="topbar-item">
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

        {/* Refresh Indicator */}
        <div className="topbar-item font-mono text-xs text-secondary">
          <span>UPDATED: {formattedTime}</span>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh telemetry metrics"
            className={`icon-btn ${loading ? 'spinning' : ''}`}
            title="Refresh metrics"
          >
            <RefreshCw size={12} />
          </button>
        </div>

        <div className="topbar-divider" />

        {/* Theme Toggle */}
        <div className="topbar-item">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} visual mode`}
            className="editorial-btn text-xs font-mono theme-toggle-btn"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          >
            {theme === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
            <span>{theme.toUpperCase()}</span>
          </button>
        </div>

        <div className="topbar-divider" />

        {/* Real User Identity & Logout */}
        <div className="topbar-item font-mono text-xs">
          <User size={13} className="text-secondary" />
          <span className="user-name-text">{user?.username || 'GUEST'}</span>
          {user?.role && (
            <span className={`editorial-pill ${user.role === 'ADMIN' ? 'pill-healthy' : 'pill-neutral'}`}>
              {user.role}
            </span>
          )}
          <button
            type="button"
            onClick={logout}
            aria-label="Sign Out and terminate session"
            className="icon-btn logout-btn"
            title="Sign Out / Terminate Session"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>

      <style>{`
        .topbar {
          height: var(--topbar-height);
          position: sticky;
          top: 0;
          background-color: var(--bg-surface);
          border-bottom: 1px solid var(--border-strong);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          z-index: 10;
        }

        .topbar-left, .topbar-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .brand-icon {
          color: var(--accent);
        }

        .brand-title {
          font-family: var(--font-sans);
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 0.12em;
          color: var(--text-primary);
        }

        .brand-tag {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-tertiary);
          border: 1px solid var(--border-subtle);
          padding: 1px 5px;
          border-radius: 2px;
        }

        .topbar-divider {
          width: 1px;
          height: 16px;
          background-color: var(--border-subtle);
        }

        .topbar-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .theme-toggle-btn {
          padding: 4px 10px;
          font-size: 10px;
        }

        .user-name-text {
          font-weight: 600;
          color: var(--text-primary);
        }

        .logout-btn {
          margin-left: 4px;
          color: var(--text-tertiary);
        }

        .logout-btn:hover {
          color: var(--status-critical);
        }

        .live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: var(--status-healthy);
          display: inline-block;
          box-shadow: 0 0 6px var(--status-healthy);
        }

        .dot-stale {
          background-color: var(--status-warning);
          box-shadow: 0 0 6px var(--status-warning);
        }

        .pill-warning {
          background: rgba(245, 158, 11, 0.1);
          color: var(--status-warning);
          border-color: rgba(245, 158, 11, 0.3);
        }

        .icon-btn {
          background: transparent;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          padding: 2px;
          display: flex;
          align-items: center;
          transition: color 0.15s ease;
        }

        .icon-btn:hover {
          color: var(--accent);
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          100% { transform: rotate(360deg); }
        }

        .text-secondary {
          color: var(--text-secondary);
        }

        .text-xs {
          font-size: 11px;
        }
      `}</style>
    </header>
  );
}

export default TopBar;
