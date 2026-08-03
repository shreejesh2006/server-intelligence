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
  Bot,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const NAV_ITEMS = [
  { id: '01', name: 'OVERVIEW', path: '/overview', icon: LayoutDashboard, adminOnly: false },
  { id: '02', name: 'SERVERS', path: '/servers', icon: Server, adminOnly: false },
  { id: '03', name: 'FORECASTS', path: '/forecasts', icon: TrendingUp, adminOnly: false },
  { id: '04', name: 'ANOMALIES', path: '/anomalies', icon: AlertTriangle, adminOnly: false },
  { id: '05', name: 'ALERTS', path: '/alerts', icon: Bell, adminOnly: false },
  { id: '06', name: 'ANALYTICS', path: '/analytics', icon: BarChart2, adminOnly: false },
  { id: '07', name: 'USERS', path: '/users', icon: Users, adminOnly: true },
  { id: '08', name: 'ASSISTANT', path: '/assistant', icon: Bot, adminOnly: false },
  { id: '09', name: 'SETTINGS', path: '/settings', icon: Sliders, adminOnly: true },
];



export function Sidebar() {
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
    <aside className={`sidebar ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Sidebar Header with Collapse Toggle */}
      <div className="sidebar-section-header">
        {!isCollapsed && <span className="editorial-tag font-mono">NAVIGATION / INDEX</span>}
        <button
          type="button"
          onClick={toggleCollapse}
          className="collapse-toggle-btn"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Navigation List */}
      <nav className="nav-list font-mono">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.id}
              to={item.path}
              title={isCollapsed ? `${item.id} / ${item.name}` : undefined}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'nav-item-active' : ''}`
              }
            >
              <span className="nav-num">{item.id}</span>
              {!isCollapsed && <span className="nav-label">{item.name}</span>}
              <Icon size={14} className="nav-icon" />
            </NavLink>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="sidebar-footer font-mono">
        {isCollapsed ? (
          <div className="system-meta-compact" title="VICTORIAMETRICS CONNECTED">
            <span className="live-dot-small" />
          </div>
        ) : (
          <div className="system-meta-block">
            <div className="meta-label">ENGINE STATE</div>
            <div className="meta-value">VICTORIAMETRICS CONNECTED</div>
          </div>
        )}
      </div>

      <style>{`
        .sidebar {
          width: var(--sidebar-width);
          height: calc(100vh - var(--topbar-height) - var(--footer-height));
          position: sticky;
          top: var(--topbar-height);
          align-self: flex-start;
          overflow-y: auto;
          background-color: var(--bg-surface);
          border-right: 1px solid var(--border-strong);
          display: flex;
          flex-direction: column;
          padding: 16px 0;
          flex-shrink: 0;
          transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 8;
        }

        .sidebar-collapsed {
          width: 64px;
        }

        .sidebar-section-header {
          padding: 0 16px 12px 16px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 36px;
        }

        .sidebar-collapsed .sidebar-section-header {
          justify-content: center;
          padding: 0 0 12px 0;
        }

        .collapse-toggle-btn {
          background: transparent;
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
          border-radius: 2px;
        }

        .collapse-toggle-btn:hover {
          background: var(--bg-surface-hover);
          color: var(--accent);
          border-color: var(--accent);
        }

        .nav-list {
          display: flex;
          flex-direction: column;
          flex: 1;
          gap: 2px;
          width: 100%;
        }

        .nav-item {
          display: flex;
          align-items: center;
          height: 42px;
          width: 100%;
          padding: 0 20px;
          color: var(--text-secondary);
          text-decoration: none;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.05em;
          border-left: 3px solid transparent;
          transition: all 0.15s ease;
          box-sizing: border-box;
          white-space: nowrap;
        }

        .sidebar-collapsed .nav-item {
          justify-content: space-between;
          padding: 0 14px;
        }

        .nav-item:hover {
          color: var(--text-primary);
          background-color: var(--bg-surface-hover);
        }

        .nav-item-active {
          color: var(--accent);
          background-color: var(--accent-muted);
          border-left-color: var(--accent);
          font-weight: 600;
        }

        .nav-num {
          font-family: var(--font-mono);
          opacity: 0.6;
          font-size: 10px;
          width: 24px;
          flex-shrink: 0;
          text-align: left;
        }

        .nav-label {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          text-align: left;
          padding-left: 4px;
        }

        .nav-icon {
          flex-shrink: 0;
          opacity: 0.6;
          width: 16px;
          transition: opacity 0.15s ease;
        }

        .nav-item:hover .nav-icon,
        .nav-item-active .nav-icon {
          opacity: 1;
        }

        .sidebar-footer {
          padding: 16px;
          border-top: 1px solid var(--border-subtle);
          margin-top: 12px;
          width: 100%;
        }

        .sidebar-collapsed .sidebar-footer {
          padding: 12px 0;
          display: flex;
          justify-content: center;
        }

        .system-meta-block {
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 10px 12px;
          width: 100%;
        }

        .system-meta-compact {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
        }

        .live-dot-small {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: var(--status-healthy);
          box-shadow: 0 0 6px var(--status-healthy);
        }

        .meta-label {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          color: var(--text-tertiary);
          text-transform: uppercase;
          margin-bottom: 4px;
        }

        .meta-value {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-primary);
          font-weight: 500;
        }
      `}</style>
    </aside>
  );
}

export default Sidebar;
