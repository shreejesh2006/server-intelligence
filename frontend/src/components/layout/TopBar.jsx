import React from 'react';
import { Activity, Server, RefreshCw, User, WifiOff, Sun, Moon, LogOut } from 'lucide-react';
import { formatUtcTime } from '../../utils/formatters';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

export function TopBar({ isOffline, lastUpdated, onRefresh, loading }) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  const formattedTime = lastUpdated
    ? formatUtcTime(Math.floor(lastUpdated.getTime() / 1000))
    : 'INITIALIZING...';

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

        {/* Live / Offline Status */}
        <div className="topbar-item">
          {isOffline ? (
            <span className="editorial-pill pill-critical">
              <WifiOff size={11} /> API DISCONNECTED
            </span>
          ) : (
            <span className="editorial-pill pill-healthy">
              <span className="live-dot" /> LIVE TELEMETRY
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
