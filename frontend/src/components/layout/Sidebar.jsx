import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { 
  LayoutDashboard, 
  Server, 
  TrendingUp, 
  AlertTriangle, 
  Bell, 
  BarChart2, 
  Users, 
  Sliders,
  ChevronLeft,
  ChevronRight

} from 'lucide-react';

const NAV_ITEMS = [
  { name: 'OVERVIEW', path: '/overview', icon: LayoutDashboard, adminOnly: false },
  { name: 'SERVERS', path: '/servers', icon: Server, adminOnly: false },
  { name: 'FORECASTS', path: '/forecasts', icon: TrendingUp, adminOnly: false },
  { name: 'ANOMALIES', path: '/anomalies', icon: AlertTriangle, adminOnly: false },
  { name: 'ALERTS', path: '/alerts', icon: Bell, adminOnly: false },
  { name: 'ANALYTICS', path: '/analytics', icon: BarChart2, adminOnly: false },
  { name: 'USERS', path: '/users', icon: Users, adminOnly: true },
];


export function Sidebar({ onOpenSettings }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const visibleNavItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('server_intel_sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('server_intel_sidebar_collapsed', isCollapsed);
  }, [isCollapsed]);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => !prev);
  };

  return (
    <aside className={`neo-sidebar ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Sidebar Header */}
      <div className="sidebar-header">
        {!isCollapsed && <span className="editorial-tag font-mono">NAVIGATION</span>}
        <button
          type="button"
          onClick={toggleCollapse}
          className="neo-toggle-btn"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      {/* Navigation List */}
      <nav className="nav-list font-mono">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              to={item.path}
              title={isCollapsed ? item.name : undefined}
              className={({ isActive }) =>
                `neo-nav-item ${isActive ? 'nav-item-active' : ''}`
              }
            >
              <Icon size={14} className="nav-icon" />
              {!isCollapsed && <span className="nav-label">{item.name}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="sidebar-footer font-mono">
        {!isCollapsed ? (
          <div className="system-status-inset">
            <div className="status-label text-tertiary">ENGINE TELEMETRY</div>
            <div className="status-value text-accent font-bold">VICTORIAMETRICS ACTIVE</div>
          </div>
        ) : (
          <div className="status-dot-compact" title="VICTORIAMETRICS ACTIVE">
            <span className="live-dot-small" />
          </div>
        )}
      </div>

      <style>{`
        .neo-sidebar {
          width: var(--sidebar-width);
          position: sticky;
          top: 0;
          background-color: var(--bg-surface);
          border-right: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          padding: 12px 10px;
          flex-shrink: 0;
          transition: width 0.15s ease;
          z-index: 8;
        }

        .sidebar-collapsed {
          width: 60px;
          padding: 12px 6px;
        }

        .sidebar-header {
          padding: 0 4px 10px 4px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .sidebar-collapsed .sidebar-header {
          justify-content: center;
        }

        .neo-toggle-btn {
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          width: 24px;
          height: 24px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .neo-toggle-btn:hover {
          color: var(--accent);
          border-color: var(--accent-border);
        }

        .nav-list {
          display: flex;
          flex-direction: column;
          flex: 1;
          gap: 4px;
          width: 100%;
        }

        .neo-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          height: 36px;
          width: 100%;
          padding: 0 12px;
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 11px;
          letter-spacing: 0.04em;
          border-radius: var(--radius-md);
          transition: all 0.15s ease;
          box-sizing: border-box;
          white-space: nowrap;
          border-left: 3px solid transparent;
        }

        .sidebar-collapsed .neo-nav-item {
          justify-content: center;
          padding: 0;
        }

        .neo-nav-item:hover:not(.nav-item-active) {
          color: var(--text-primary);
          background-color: var(--bg-surface-hover);
        }

        .nav-item-active {
          background: var(--accent-muted);
          border-left-color: var(--accent);
          color: var(--accent);
          font-weight: 700;
        }

        .nav-label {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .nav-icon {
          flex-shrink: 0;
          opacity: 0.7;
          transition: opacity 0.15s ease;
        }

        .neo-nav-item:hover .nav-icon,
        .nav-item-active .nav-icon {
          opacity: 1;
        }

        .sidebar-footer {
          padding-top: 10px;
          border-top: 1px solid var(--border-subtle);
          margin-top: 10px;
        }

        .system-status-inset {
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 8px 10px;
        }

        .status-label {
          font-size: 9px;
          letter-spacing: 0.06em;
          margin-bottom: 2px;
        }

        .status-value {
          font-size: 10px;
          letter-spacing: 0.03em;
        }

        .status-dot-compact {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 28px;
          background: var(--bg-inset);
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);
        }

        .live-dot-small {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: var(--status-healthy);
        }
      `}</style>
    </aside>
  );
}

export default Sidebar;
