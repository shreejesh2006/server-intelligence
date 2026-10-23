import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { 
  LayoutDashboard, 
  Server, 
  TrendingUp, 
  AlertTriangle, 
  Bell,
  ShieldAlert,
  Zap,
  ScrollText,
  Users,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const NAV_ITEMS = [
  { name: 'Overview', path: '/overview', icon: LayoutDashboard },
  { name: 'Servers', path: '/servers', icon: Server },
  { name: 'Forecasts', path: '/forecasts', icon: TrendingUp },
  { name: 'Anomalies', path: '/anomalies', icon: AlertTriangle },
  { name: 'Alerts', path: '/alerts', icon: Bell },
  { name: 'Incidents', path: '/incidents', icon: ShieldAlert },
  { name: 'Automations', path: '/automations', icon: Zap },
  { name: 'Logs', path: '/logs', icon: ScrollText },
  { name: 'Users', path: '/users', icon: Users, role: 'ADMIN' },
];

export function Sidebar() {
  const { user } = useAuth();

  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('nokia_sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('nokia_sidebar_collapsed', isCollapsed);
  }, [isCollapsed]);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => !prev);
  };

  return (
    <aside className={`nokia-sidebar ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-header">
        {!isCollapsed && (
          <div className="brand-title-group">
            <span className="brand-main font-semibold">NETRA</span>
            <span className="brand-sub font-medium">INTELLIGENCE</span>
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapse}
          className="collapse-toggle-btn"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <nav className="sidebar-nav font-sans">
        {NAV_ITEMS.filter((item) => !item.role || user?.role === item.role).map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              to={item.path}
              title={isCollapsed ? item.name : undefined}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <Icon size={16} className="nav-icon" />
              {!isCollapsed && <span className="nav-text">{item.name}</span>}
            </NavLink>
          );
        })}
      </nav>

      <style>{`
        .nokia-sidebar {
          width: var(--sidebar-width);
          background-color: var(--bg-surface);
          border-right: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          padding: 16px 10px;
          flex-shrink: 0;
          transition: width 0.15s ease;
          z-index: 10;
        }

        .sidebar-collapsed {
          width: var(--sidebar-width-collapsed);
          padding: 16px 6px;
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 4px 16px 4px;
        }

        .sidebar-collapsed .sidebar-header {
          justify-content: center;
          padding: 0 0 16px 0;
        }

        .brand-title-group {
          display: flex;
          flex-direction: column;
          line-height: 1.1;
        }

        .brand-main {
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.01em;
          color: var(--text-primary);
        }

        .brand-sub {
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.08em;
          color: var(--text-muted);
        }

        .collapsed-eye-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .collapsed-eye-icon {
          color: var(--text-primary);
        }

        .collapse-toggle-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          width: 24px;
          height: 24px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .collapse-toggle-btn:hover {
          color: var(--text-primary);
          background: var(--bg-subtle);
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 10px;
          height: 34px;
          padding: 0 10px;
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 13px;
          font-weight: 400;
          border-radius: var(--radius-sm);
          transition: all 0.15s ease;
        }

        .sidebar-collapsed .nav-link {
          justify-content: center;
          padding: 0;
        }

        .nav-link:hover:not(.active) {
          color: var(--text-primary);
          background-color: var(--bg-subtle);
        }

        .nav-link.active {
          color: var(--text-primary);
          background-color: var(--bg-subtle);
          font-weight: 500;
        }

        .nav-icon {
          flex-shrink: 0;
          color: var(--text-muted);
        }

        .nav-link.active .nav-icon {
          color: var(--text-primary);
        }
      `}</style>
    </aside>
  );
}

export default Sidebar;
