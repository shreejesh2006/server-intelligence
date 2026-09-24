import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import OfflineBanner from '../../components/common/OfflineBanner';
import { useServer } from '../../context/ServerContext';
import { useTimezone } from '../../context/TimezoneContext';
import { getAlertsApi } from '../../services/alerts';
import { ArrowLeft } from 'lucide-react';

export function AlertsPage() {
  const { activeServer } = useServer();
  const { formatTimestamp } = useTimezone();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAlertsApi();
      setAlerts(data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to connect to alert service');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const getStatusBadge = (status) => {
    if (status === 'RESOLVED') return <span className="nokia-badge badge-healthy">Resolved</span>;
    if (status === 'ACKNOWLEDGED') return <span className="nokia-badge badge-neutral">Acknowledged</span>;
    return <span className="nokia-badge badge-warning">Active</span>;
  };

  const getSeverityBadge = (severity) => {
    if (severity === 'CRITICAL') return <span className="nokia-badge badge-critical">Critical</span>;
    if (severity === 'WARNING') return <span className="nokia-badge badge-warning">Warning</span>;
    return <span className="nokia-badge badge-neutral">Info</span>;
  };

  return (
    <div className="alerts-page font-sans">
      {/* Header */}
      <div className="page-header-block">
        <Link to="/overview" className="back-to-home-link font-sans text-xs">
          <ArrowLeft size={13} />
          <span>Back to Overview</span>
        </Link>
        <h1 className="page-title font-sans">Alerts</h1>
      </div>

      {error && <div className="error-banner font-sans text-xs">{error}</div>}

      {/* Operational Table */}
      <div className="nokia-table-container margin-top-md">
        <table className="nokia-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Severity</th>
              <th>Alert</th>
              <th>Server</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center text-muted">Loading alerts...</td>
              </tr>
            ) : alerts.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-muted">No active alerts recorded</td>
              </tr>
            ) : (
              alerts.map((alertItem) => (
                <tr key={alertItem.id}>
                  <td>{getStatusBadge(alertItem.status)}</td>
                  <td>{getSeverityBadge(alertItem.severity)}</td>
                  <td className="font-medium">{alertItem.title || alertItem.message}</td>
                  <td>{alertItem.server || activeServer.name}</td>
                  <td className="font-mono text-muted">{alertItem.created_at ? formatTimestamp(new Date(alertItem.created_at).getTime() / 1000, true) : 'N/A'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        .alerts-page {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .page-header-block {
          margin-bottom: 4px;
        }

        .back-to-home-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 500;
          text-decoration: none;
          padding: 4px 8px;
          margin-left: -8px;
          margin-bottom: 6px;
          border-radius: var(--radius-xs);
          transition: all 0.15s ease;
        }

        .back-to-home-link:hover {
          color: var(--text-primary);
          background-color: var(--bg-subtle);
          transform: translateX(-2px);
        }

        .page-title {
          font-size: 24px;
          font-weight: 600;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .margin-top-md { margin-top: 12px; }
        .text-center { text-align: center; }

        .error-banner {
          padding: 10px 14px;
          background: var(--status-critical-bg);
          color: var(--status-critical);
          border-radius: var(--radius-sm);
        }
      `}</style>
    </div>
  );
}

export default AlertsPage;
