import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import { 
  RefreshCw, 
  WifiOff, 
  Sun, 
  Moon, 
  LogOut, 
  Settings, 
  User, 
  ChevronDown,
  Bell,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTimezone } from '../../context/TimezoneContext';
import { getAlertsApi } from '../../services/alerts';

export function TopBar({ 
  isOffline, 
  lastUpdated, 
  onRefresh, 
  loading, 
  freshnessState = 'FRESH', 
  freshnessLabel = 'Connected',
  onOpenSettings 
}) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { formatTimestamp } = useTimezone();

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);

  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState(null);
  
  const menuRef = useRef(null);
  const alertsRef = useRef(null);

  const currentRole = user?.role || 'ADMIN';
  const isDarkMode = theme === 'dark';

  const fetchAlerts = useCallback(async () => {
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const data = await getAlertsApi();
      setAlerts(Array.isArray(data) ? data : []);
    } catch (_err) {
      setAlertsError('Failed to load notifications');
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts, lastUpdated]);

  const activeAlerts = alerts.filter((a) => a.status !== 'RESOLVED');
  const activeCount = activeAlerts.length;

  const formattedTime = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
    : 'Updating...';

  let badgeClass = 'badge-healthy';
  let displayStatus = 'Connected';
  if (freshnessState === 'OFFLINE' || isOffline) {
    badgeClass = 'badge-critical';
    displayStatus = 'Offline';
  } else if (freshnessState === 'STALE') {
    badgeClass = 'badge-warning';
    displayStatus = 'Stale';
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsProfileMenuOpen(false);
      }
      if (alertsRef.current && !alertsRef.current.contains(e.target)) {
        setIsAlertsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="nokia-topbar font-sans">
      <div className="topbar-left-spacer" />

      <div className="topbar-actions">
        {/* Status Pill */}
        {isOffline || freshnessState === 'OFFLINE' ? (
          <span className="nokia-badge badge-critical">
            <WifiOff size={12} /> Offline
          </span>
        ) : (
          <span className={`nokia-badge ${badgeClass}`}>
            <span className={`status-dot ${freshnessState === 'STALE' ? 'dot-warning' : 'dot-healthy'}`} />
            {displayStatus}
          </span>
        )}

        {/* Telemetry timestamp */}
        <div className="timestamp-wrapper">
          <span className="timestamp-val font-sans">{formattedTime}</span>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh telemetry metrics"
            className={`nokia-btn refresh-btn ${loading ? 'spinning' : ''}`}
            title="Refresh metrics"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {/* Alerts Notification Dropdown */}
        <div className="profile-container" ref={alertsRef}>
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={() => setIsAlertsOpen((prev) => !prev)}
            title="Notifications"
          >
            <Bell size={14} />
            {activeCount > 0 && (
              <span className="bell-badge-count font-mono">{activeCount}</span>
            )}
          </button>

          {isAlertsOpen && (
            <div className="profile-dropdown alerts-dropdown font-sans">
              <div className="dropdown-header alerts-popover-header">
                <span className="dropdown-username font-medium">Notifications</span>
                {activeCount > 0 && (
                  <span className="nokia-badge badge-warning font-sans text-xs">
                    {activeCount} Active
                  </span>
                )}
              </div>

              <div className="alerts-dropdown-body font-sans">
                {alertsLoading && alerts.length === 0 ? (
                  <div className="notification-state-text text-muted text-xs font-sans">
                    Loading notifications...
                  </div>
                ) : alertsError && alerts.length === 0 ? (
                  <div className="notification-state-text text-muted text-xs font-sans">
                    {alertsError}
                  </div>
                ) : activeAlerts.length === 0 ? (
                  <div className="notification-empty font-medium">
                    <CheckCircle2 size={14} className="text-healthy-icon" />
                    <span>No new alerts</span>
                  </div>
                ) : (
                  <div className="alerts-popover-list">
                    {activeAlerts.slice(0, 5).map((item) => (
                      <div key={item.id} className="alerts-popover-item font-sans">
                        <div className="popover-item-top font-sans">
                          <span className={`nokia-badge ${item.severity === 'CRITICAL' ? 'badge-critical' : 'badge-warning'} font-sans text-xs`}>
                            {item.severity || 'WARNING'}
                          </span>
                          {item.server && (
                            <span className="popover-item-host font-mono text-xs text-muted">{item.server}</span>
                          )}
                        </div>
                        <div className="popover-item-msg font-sans font-medium text-xs">
                          {item.title || item.message}
                        </div>
                        {item.created_at && (
                          <div className="popover-item-time font-mono text-muted text-xs">
                            {formatTimestamp(new Date(item.created_at).getTime() / 1000, true, false)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="alerts-popover-footer">
                <Link
                  to="/alerts"
                  className="popover-footer-link font-sans text-xs"
                  onClick={() => setIsAlertsOpen(false)}
                >
                  <span>View all alerts</span>
                  <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Menu */}
        <div className="profile-container" ref={menuRef}>
          <button
            type="button"
            className="profile-trigger"
            onClick={() => setIsProfileMenuOpen((prev) => !prev)}
            title="User Settings"
          >
            <User size={13} className="user-icon" />
            <span className="user-name">{user?.username || 'Operator'}</span>
            <ChevronDown size={12} className={`chevron ${isProfileMenuOpen ? 'rotate' : ''}`} />
          </button>

          {isProfileMenuOpen && (
            <div className="profile-dropdown">
              <div className="dropdown-header">
                <div className="dropdown-username">{user?.username || 'Operator'}</div>
                <div className="dropdown-role">{currentRole}</div>
              </div>

              <div className="dropdown-actions">
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    if (onOpenSettings) onOpenSettings();
                  }}
                >
                  <Settings size={14} />
                  <span>Settings</span>
                </button>

                <button
                  type="button"
                  className="dropdown-item"
                  onClick={toggleTheme}
                >
                  {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
                  <span>{isDarkMode ? 'Light mode' : 'Dark mode'}</span>
                </button>

                <div className="dropdown-hsep" />

                <button
                  type="button"
                  className="dropdown-item dropdown-item-danger"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    logout();
                  }}
                >
                  <LogOut size={14} />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .nokia-topbar {
          height: var(--topbar-height);
          background-color: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          flex-shrink: 0;
          z-index: 100;
        }

        .topbar-left-spacer {
          flex: 1;
        }

        .topbar-icon-btn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background-color: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .topbar-icon-btn:hover {
          color: var(--text-primary);
          background-color: var(--bg-subtle);
        }

        .bell-badge-count {
          position: absolute;
          top: -2px;
          right: -2px;
          min-width: 15px;
          height: 15px;
          padding: 0 4px;
          border-radius: 8px;
          background-color: var(--status-critical);
          color: #ffffff;
          font-size: 10px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }

        .alerts-dropdown {
          width: 340px;
          padding: 8px;
        }

        .alerts-popover-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 8px 8px 8px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .alerts-dropdown-body {
          padding: 8px 0;
        }

        .notification-empty {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12.5px;
          color: var(--text-primary);
          padding: 10px 12px;
          background-color: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          width: 100%;
          box-sizing: border-box;
        }

        .notification-state-text {
          padding: 12px;
          text-align: center;
        }

        .alerts-popover-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .alerts-popover-item {
          background-color: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xs);
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .popover-item-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .popover-item-msg {
          color: var(--text-primary);
          line-height: 1.3;
        }

        .popover-item-time {
          color: var(--text-muted);
        }

        .alerts-popover-footer {
          border-top: 1px solid var(--border-subtle);
          padding-top: 6px;
        }

        .popover-footer-link {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 8px;
          color: var(--text-secondary);
          text-decoration: none;
          border-radius: var(--radius-xs);
          transition: all 0.15s ease;
        }

        .popover-footer-link:hover {
          color: var(--text-primary);
          background-color: var(--bg-subtle);
        }

        .topbar-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .timestamp-wrapper {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .timestamp-val {
          font-size: 11px;
        }

        .refresh-btn {
          width: 26px;
          height: 26px;
          padding: 0;
          background: transparent;
          border: none;
          color: var(--text-muted);
          border-radius: var(--radius-sm);
        }

        .refresh-btn:hover {
          color: var(--text-primary);
          background: var(--bg-subtle);
        }

        .refresh-btn.spinning svg {
          animation: spin 1s linear infinite;
        }

        @keyframes spin { 100% { transform: rotate(360deg); } }

        .profile-container {
          position: relative;
        }

        .profile-trigger {
          display: flex;
          align-items: center;
          gap: 6px;
          height: 28px;
          padding: 0 8px;
          background-color: transparent;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          cursor: pointer;
          color: var(--text-primary);
          font-size: 12px;
        }

        .profile-trigger:hover {
          background-color: var(--bg-subtle);
        }

        .user-name {
          font-size: 12px;
          font-weight: 500;
        }

        .chevron {
          color: var(--text-muted);
          transition: transform 0.15s ease;
        }

        .chevron.rotate {
          transform: rotate(180deg);
        }

        .profile-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          min-width: 170px;
          padding: 6px;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
          z-index: 500;
        }

        .dropdown-header {
          padding: 6px 10px 8px 10px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 4px;
        }

        .dropdown-username {
          font-weight: 600;
          font-size: 13px;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .dropdown-role {
          font-size: 10px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-top: 2px;
        }

        .dropdown-actions {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 7px 10px;
          background: transparent;
          border: none;
          border-radius: var(--radius-xs);
          color: var(--text-primary);
          font-family: var(--font-sans);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          text-align: left;
          white-space: nowrap;
          transition: background-color 0.15s ease, color 0.15s ease;
        }

        .dropdown-item:hover {
          background-color: var(--bg-subtle);
        }

        .dropdown-item-danger {
          color: var(--status-critical);
        }

        .dropdown-item-danger:hover {
          background-color: var(--status-critical-bg);
          color: var(--status-critical);
        }

        .dropdown-hsep {
          height: 1px;
          background-color: var(--border-subtle);
          margin: 4px 0;
        }
      `}</style>
    </header>
  );
}

export default TopBar;
