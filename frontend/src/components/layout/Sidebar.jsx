import React from 'react';
import { NavLink } from 'react-router';
import { 
  LayoutDashboard, 
  Server, 
  TrendingUp, 
  AlertTriangle, 
  Bell, 
  BarChart2, 
  Users, 
  Sliders 
} from 'lucide-react';

const NAV_ITEMS = [
  { id: '01', name: 'OVERVIEW', path: '/overview', icon: LayoutDashboard },
  { id: '02', name: 'SERVERS', path: '/servers', icon: Server },
  { id: '03', name: 'FORECASTS', path: '/forecasts', icon: TrendingUp },
  { id: '04', name: 'ANOMALIES', path: '/anomalies', icon: AlertTriangle },
  { id: '05', name: 'ALERTS', path: '/alerts', icon: Bell },
  { id: '06', name: 'ANALYTICS', path: '/analytics', icon: BarChart2 },
  { id: '07', name: 'USERS', path: '/users', icon: Users },
  { id: '08', name: 'SETTINGS', path: '/settings', icon: Sliders },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-section-header">
        <span className="editorial-tag">NAVIGATION / INDEX</span>
      </div>

      <nav className="nav-list">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'nav-item-active' : ''}`
              }
            >
              <span className="nav-num">{item.id}</span>
              <span className="nav-label">{item.name}</span>
              <Icon size={14} className="nav-icon" />
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="system-meta-block">
          <div className="meta-label">ENGINE STATE</div>
          <div className="meta-value">VICTORIAMETRICS CONNECTED</div>
        </div>
      </div>

      <style>{`
        .sidebar {
          width: var(--sidebar-width);
          background-color: var(--bg-surface);
          border-right: 1px solid var(--border-strong);
          display: flex;
          flex-direction: column;
          padding: 24px 0;
          flex-shrink: 0;
        }

        .sidebar-section-header {
          padding: 0 20px 16px 20px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 12px;
        }

        .nav-list {
          display: flex;
          flex-direction: column;
          flex: 1;
        }

        .nav-item {
          display: flex;
          align-items: center;
          padding: 10px 20px;
          color: var(--text-secondary);
          text-decoration: none;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.05em;
          border-left: 2px solid transparent;
          transition: all 0.15s ease;
          gap: 12px;
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
          opacity: 0.6;
          font-size: 10px;
        }

        .nav-label {
          flex: 1;
        }

        .nav-icon {
          opacity: 0.4;
          transition: opacity 0.15s ease;
        }

        .nav-item:hover .nav-icon,
        .nav-item-active .nav-icon {
          opacity: 1;
        }

        .sidebar-footer {
          padding: 20px;
          border-top: 1px solid var(--border-subtle);
        }

        .system-meta-block {
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 10px 12px;
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

        @media (max-width: 768px) {
          .sidebar {
            width: 60px;
          }
          .sidebar-section-header, .sidebar-footer, .nav-label, .nav-num {
            display: none;
          }
          .nav-item {
            justify-content: center;
            padding: 14px 0;
          }
        }
      `}</style>
    </aside>
  );
}

export default Sidebar;
