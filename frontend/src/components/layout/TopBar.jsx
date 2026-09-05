import React, { useState, useRef, useEffect } from 'react';
import { 
  Activity, 
  Server, 
  RefreshCw, 
  WifiOff, 
  Sun, 
  Moon, 
  LogOut, 
  ShieldCheck, 
  Crown, 
  Terminal, 
  Eye, 
  Settings, 
  User, 
  ChevronDown 
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useServer } from '../../context/ServerContext';

export function TopBar({ 
  isOffline, 
  lastUpdated, 
  onRefresh, 
  loading, 
  freshnessState = 'FRESH', 
  freshnessLabel = 'TELEMETRY FRESH',
  onOpenSettings 
}) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { formatTimestamp } = useTimezone();
  const { servers = [], selectedHost, selectServer } = useServer();

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const currentRole = user?.role || 'ADMIN';
  const isDarkMode = theme === 'dark';

  const formattedTime = lastUpdated
    ? formatTimestamp(Math.floor(lastUpdated.getTime() / 1000), true)
    : 'INITIALIZING...';

  let pillClass = 'pill-healthy';
  if (freshnessState === 'OFFLINE' || isOffline) {
    pillClass = 'pill-critical';
  } else if (freshnessState === 'STALE') {
    pillClass = 'pill-warning';
  }

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const renderRoleLogo = (roleName) => {
    switch (roleName) {
      case 'ADMIN':
        return (
          <div className="profile-logo-avatar avatar-admin" title="Admin Logo">
            <Crown size={14} className="text-warning" />
          </div>
        );
      case 'OPERATOR':
        return (
          <div className="profile-logo-avatar avatar-operator" title="Operator Logo">
            <Terminal size={14} className="text-accent" />
          </div>
        );
      case 'VIEWER':
      default:
        return (
          <div className="profile-logo-avatar avatar-viewer" title="Viewer Logo">
            <Eye size={14} className="text-info" />
          </div>
        );
    }
  };

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

        {/* PROFILE ICON & POPUP MENU WRAPPER */}
        <div className="user-profile-menu-container" ref={menuRef}>
          <button
            type="button"
            className={`profile-trigger-btn ${isProfileMenuOpen ? 'active' : ''}`}
            onClick={() => setIsProfileMenuOpen((prev) => !prev)}
            title="User Profile & Settings Menu"
          >
            {renderRoleLogo(currentRole)}
            <span className="user-name-text text-xs">{user?.username || 'ADMIN'}</span>
            <span className={`editorial-pill pill-role ${currentRole === 'ADMIN' ? 'pill-warning' : currentRole === 'OPERATOR' ? 'pill-healthy' : 'pill-info'}`}>
              {currentRole}
            </span>
            <ChevronDown size={12} className={`chevron-icon ${isProfileMenuOpen ? 'rotate' : ''}`} />
          </button>

          {/* PROFILE POPUP MENU CARD */}
          {isProfileMenuOpen && (
            <div className="profile-popup-menu neo-card font-mono">
              {/* Header Info */}
              <div className="popup-user-header border-bottom padding-bottom-xs">
                <div className="flex-center gap-xs">
                  {renderRoleLogo(currentRole)}
                  <div>
                    <div className="font-bold text-primary font-sans">{user?.username || 'ADMIN USER'}</div>
                    <div className="text-xs text-tertiary">ROLE: {currentRole}</div>
                  </div>
                </div>
              </div>

              {/* Popup Action List */}
              <div className="popup-actions-list margin-top-xs">
                {/* 1. Settings Button */}
                <button
                  type="button"
                  className="popup-action-item"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    if (onOpenSettings) onOpenSettings();
                  }}
                >
                  <Settings size={14} className="text-accent" />
                  <span>SETTINGS & PREFERENCES</span>
                </button>



                {/* 3. Light / Dark Mode Toggle */}
                <button
                  type="button"
                  className="popup-action-item"
                  onClick={toggleTheme}
                >
                  {isDarkMode ? <Sun size={14} className="text-warning" /> : <Moon size={14} className="text-info" />}
                  <span>{isDarkMode ? 'SWITCH TO LIGHT MODE' : 'SWITCH TO DARK MODE'}</span>
                </button>

                <div className="popup-divider" />

                {/* 4. Logout Button */}
                <button
                  type="button"
                  className="popup-action-item text-critical"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    logout();
                  }}
                >
                  <LogOut size={14} />
                  <span>SIGN OUT / LOGOUT</span>
                </button>
              </div>
            </div>
          )}
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
          z-index: 100;
          position: relative;
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

        .user-profile-menu-container {
          position: relative;
        }

        .profile-trigger-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 34px;
          padding: 0 10px;
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: var(--shadow-inset-sm);
        }

        .profile-trigger-btn:hover, .profile-trigger-btn.active {
          border-color: var(--accent-border);
          background: var(--bg-surface-hover);
        }

        .profile-logo-avatar {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .avatar-admin {
          background: rgba(245, 158, 11, 0.18);
          border: 1px solid rgba(245, 158, 11, 0.4);
        }

        .avatar-operator {
          background: var(--accent-muted);
          border: 1px solid var(--accent-border);
        }

        .avatar-viewer {
          background: rgba(56, 189, 248, 0.18);
          border: 1px solid rgba(56, 189, 248, 0.4);
        }

        .user-name-text {
          font-weight: 700;
          color: var(--text-primary);
        }

        .chevron-icon {
          color: var(--text-tertiary);
          transition: transform 0.2s ease;
        }

        .chevron-icon.rotate {
          transform: rotate(180deg);
        }

        /* PROFILE POPUP CARD */
        .profile-popup-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 240px;
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          box-shadow: var(--shadow-raised-lg);
          border-radius: var(--radius-md);
          padding: 12px;
          z-index: 500;
          animation: popupFade 0.15s ease-out;
        }

        .popup-user-header {
          padding-bottom: 8px;
        }

        .popup-actions-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .popup-action-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 8px 10px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-primary);
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
        }

        .popup-action-item:hover {
          background: var(--bg-inset);
          border-color: var(--border-subtle);
          color: var(--accent);
        }

        .popup-divider {
          height: 1px;
          background: var(--border-subtle);
          margin: 6px 0;
        }

        .flex-center { display: flex; align-items: center; }
        .flex-between { display: flex; justify-content: space-between; align-items: center; }
        .gap-xs { gap: 6px; }
        .border-bottom { border-bottom: 1px solid var(--border-subtle); }
        .padding-bottom-xs { padding-bottom: 6px; }
        .margin-top-xs { margin-top: 6px; }

        .text-accent { color: var(--accent); }
        .text-warning { color: var(--status-warning, #f59e0b); }
        .text-critical { color: var(--status-critical, #ef4444); }
        .text-info { color: var(--status-info, #38bdf8); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }

        @keyframes popupFade {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </header>
  );
}

export default TopBar;
