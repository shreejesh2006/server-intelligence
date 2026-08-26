import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/common/PageHeader';
import { useServer } from '../../context/ServerContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useAuth } from '../../context/AuthContext';
import {
  getAlertsApi,
  acknowledgeAlertApi,
  resolveAlertApi,
  evaluateAlertsApi,
} from '../../services/alerts';
import {
  Bell,
  CheckCircle2,
  Filter,
  AlertTriangle,
  AlertCircle,
  Info,
  RefreshCw,
  Server,
  Play,
  ShieldCheck,
  Clock,
} from 'lucide-react';

export function AlertsPage() {
  const { selectedHost } = useServer();
  const { formatTimestamp } = useTimezone();
  const { user } = useAuth();

  const isOperatorOrAdmin = user && (user.role === 'ADMIN' || user.role === 'OPERATOR');

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [activeTab, setActiveTab] = useState('ALL');
  const [hostScope, setHostScope] = useState('ALL'); // 'ALL', 'ubuntu', 'kali'

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (hostScope !== 'ALL') {
        params.server = hostScope;
      }
      const data = await getAlertsApi(params);
      setAlerts(data || []);
    } catch (err) {
      setError(
        err?.response?.data?.detail || err?.message || 'Failed to connect to alert engine'
      );
    } finally {
      setLoading(false);
    }
  }, [hostScope]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleAcknowledge = async (alertId) => {
    setActionLoading(alertId);
    try {
      await acknowledgeAlertApi(alertId);
      await fetchAlerts();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to acknowledge alert');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolve = async (alertId) => {
    setActionLoading(alertId);
    try {
      await resolveAlertApi(alertId);
      await fetchAlerts();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to resolve alert');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunEvaluation = async () => {
    setEvaluating(true);
    try {
      const targetHost = hostScope === 'ALL' ? selectedHost : hostScope;
      const res = await evaluateAlertsApi(targetHost);
      await fetchAlerts();
      if (res.new_alerts_created > 0) {
        alert(`Evaluation complete: ${res.new_alerts_created} new alert(s) generated for ${targetHost}`);
      }
    } catch (err) {
      alert(err?.response?.data?.detail || 'Alert evaluation failed');
    } finally {
      setEvaluating(false);
    }
  };

  // Filter alerts based on activeTab
  const filteredAlerts = alerts.filter((a) => {
    if (activeTab === 'CRITICAL') return a.severity === 'CRITICAL' && a.status !== 'RESOLVED';
    if (activeTab === 'WARNING') return a.severity === 'WARNING' && a.status !== 'RESOLVED';
    if (activeTab === 'INFO') return a.severity === 'INFO' && a.status !== 'RESOLVED';
    if (activeTab === 'RESOLVED') return a.status === 'RESOLVED';
    return true; // 'ALL'
  });

  // Calculate dynamic stats
  const countAll = alerts.length;
  const countCritical = alerts.filter((a) => a.severity === 'CRITICAL' && a.status !== 'RESOLVED').length;
  const countWarning = alerts.filter((a) => a.severity === 'WARNING' && a.status !== 'RESOLVED').length;
  const countInfo = alerts.filter((a) => a.severity === 'INFO' && a.status !== 'RESOLVED').length;
  const countResolved = alerts.filter((a) => a.status === 'RESOLVED').length;
  const countUnresolved = alerts.filter((a) => a.status !== 'RESOLVED').length;

  const TABS = [
    { id: 'ALL', label: `ALL EVENTS (${countAll})` },
    { id: 'CRITICAL', label: `CRITICAL (${countCritical})` },
    { id: 'WARNING', label: `WARNING (${countWarning})` },
    { id: 'INFO', label: `INFORMATIONAL (${countInfo})` },
    { id: 'RESOLVED', label: `RESOLVED (${countResolved})` },
  ];

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return <AlertCircle size={18} className="text-critical" />;
      case 'WARNING':
        return <AlertTriangle size={18} className="text-warning" />;
      default:
        return <Info size={18} className="text-accent" />;
    }
  };

  const getSeverityBadgeClass = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'pill-critical';
      case 'WARNING':
        return 'pill-warning';
      default:
        return 'pill-neutral';
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'ACTIVE':
        return 'pill-warning';
      case 'ACKNOWLEDGED':
        return 'pill-neutral';
      case 'RESOLVED':
        return 'pill-healthy';
      default:
        return 'pill-neutral';
    }
  };

  return (
    <div className="alerts-page font-sans">
      <PageHeader
        index="05"
        title="INCIDENT ALERTS"
        subtitle="Real-time alert dispatching for threshold breaches, anomaly events, and capacity risks."
        tag="ALERT DISPATCH CONSOLE"
      />

      {/* FILTER & SCOPE BAR */}
      <section className="neo-card font-mono margin-top-md margin-bottom-lg">
        <div className="alert-filter-bar">
          <div className="filter-left">
            <Filter size={14} className="text-accent" />
            <span className="editorial-tag">EVENT FILTER:</span>
            <div className="neo-segmented-track">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`neo-segmented-item ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-right">
            <div className="server-scope-selector">
              <Server size={13} className="text-tertiary" />
              <span className="editorial-tag">SCOPE:</span>
              <button
                type="button"
                className={`neo-btn-sm ${hostScope === 'ALL' ? 'active' : ''}`}
                onClick={() => setHostScope('ALL')}
              >
                ALL NODES
              </button>
              <button
                type="button"
                className={`neo-btn-sm ${hostScope === 'ubuntu' ? 'active' : ''}`}
                onClick={() => setHostScope('ubuntu')}
              >
                UBUNTU
              </button>
              <button
                type="button"
                className={`neo-btn-sm ${hostScope === 'kali' ? 'active' : ''}`}
                onClick={() => setHostScope('kali')}
              >
                KALI
              </button>
            </div>

            <button
              type="button"
              className="neo-btn-icon"
              onClick={fetchAlerts}
              title="Refresh Alerts"
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>
      </section>

      {/* ALERT COMMAND CENTER HERO */}
      <section className="neo-card neo-card-raised font-mono margin-bottom-lg">
        <div className="alert-hero-row">
          <div className="hero-left">
            <div className="alert-icon-box">
              <Bell size={22} className={countCritical > 0 ? 'text-critical' : 'text-accent'} />
            </div>
            <div>
              <div className="alert-title font-sans">ACTIVE ALERT MANAGER</div>
              <div className="alert-sub text-tertiary">
                {countCritical} ACTIVE CRITICAL ALERTS &bull; {countUnresolved} UNRESOLVED INCIDENTS
              </div>
            </div>
          </div>

          <div className="hero-right">
            {isOperatorOrAdmin && (
              <button
                type="button"
                className="neo-btn neo-btn-primary"
                onClick={handleRunEvaluation}
                disabled={evaluating}
              >
                <Play size={13} className={evaluating ? 'spin' : ''} />
                <span>{evaluating ? 'EVALUATING...' : 'EVALUATE RULES NOW'}</span>
              </button>
            )}
            <span className="editorial-pill pill-neutral">DEDUPLICATION: 15M WINDOW</span>
          </div>
        </div>
      </section>

      {/* ERROR BANNER */}
      {error && (
        <div className="neo-card-inset error-banner font-mono margin-bottom-lg text-critical">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* ALERT LISTING AREA */}
      {loading ? (
        <div className="neo-card-inset empty-alerts-card font-mono margin-bottom-lg">
          <RefreshCw size={28} className="spin text-accent margin-bottom-xs" />
          <h4 className="empty-title font-sans text-primary">QUERYING INCIDENT DATABASE</h4>
          <p className="empty-desc text-secondary font-sans text-xs">
            Retrieving real-time alert events from backend storage...
          </p>
        </div>
      ) : filteredAlerts.length === 0 ? (
        /* NO ALERTS STATE — NEUMORPHIC INSET CARD */
        <div className="neo-card-inset empty-alerts-card font-mono margin-bottom-lg">
          <div className="empty-content">
            <CheckCircle2 size={32} className="text-healthy margin-bottom-xs" />
            <h4 className="empty-title font-sans text-primary">NO MATCHING INCIDENT ALERTS</h4>
            <p className="empty-desc text-secondary font-sans text-xs">
              All monitored nodes ({hostScope === 'ALL' ? 'Ubuntu and Kali' : hostScope}) are operating within nominal thresholds. No active alert triggers detected for filter '{activeTab}'.
            </p>
          </div>
        </div>
      ) : (
        <div className="alerts-grid margin-bottom-lg">
          {filteredAlerts.map((alertItem) => (
            <div
              key={alertItem.id}
              className={`neo-card alert-card severity-${alertItem.severity.toLowerCase()} status-${alertItem.status.toLowerCase()}`}
            >
              <div className="alert-card-header font-mono">
                <div className="header-tags">
                  <span className={`editorial-pill ${getSeverityBadgeClass(alertItem.severity)}`}>
                    {getSeverityIcon(alertItem.severity)}
                    <span>{alertItem.severity}</span>
                  </span>
                  <span className={`editorial-pill ${getStatusBadgeClass(alertItem.status)}`}>
                    {alertItem.status}
                  </span>
                  {alertItem.server && (
                    <span className="editorial-pill pill-neutral">
                      <Server size={11} /> {alertItem.server.toUpperCase()}
                    </span>
                  )}
                  {alertItem.metric && (
                    <span className="editorial-tag text-tertiary">
                      METRIC: {alertItem.metric.toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="header-time text-tertiary text-xs">
                  <Clock size={12} />
                  <span>{formatTimestamp(alertItem.created_at)}</span>
                </div>
              </div>

              <div className="alert-card-body">
                <h3 className="alert-card-title font-sans text-primary">{alertItem.title}</h3>
                <p className="alert-card-msg font-sans text-secondary">{alertItem.message}</p>

                <div className="alert-meta-row font-mono text-tertiary text-xs">
                  <span>SOURCE: {alertItem.source}</span>
                  {alertItem.acknowledged_at && (
                    <span>ACK: {formatTimestamp(alertItem.acknowledged_at)}</span>
                  )}
                  {alertItem.resolved_at && (
                    <span>RESOLVED: {formatTimestamp(alertItem.resolved_at)}</span>
                  )}
                </div>
              </div>

              {/* ACTION FOOTER */}
              {isOperatorOrAdmin && alertItem.status !== 'RESOLVED' && (
                <div className="alert-card-footer border-top padding-top-xs margin-top-xs">
                  {alertItem.status === 'ACTIVE' && (
                    <button
                      type="button"
                      className="neo-btn-sm"
                      onClick={() => handleAcknowledge(alertItem.id)}
                      disabled={actionLoading === alertItem.id}
                    >
                      <ShieldCheck size={12} />
                      <span>{actionLoading === alertItem.id ? 'ACKNOWLEDGING...' : 'ACKNOWLEDGE'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="neo-btn-sm neo-btn-healthy"
                    onClick={() => handleResolve(alertItem.id)}
                    disabled={actionLoading === alertItem.id}
                  >
                    <CheckCircle2 size={12} />
                    <span>{actionLoading === alertItem.id ? 'RESOLVING...' : 'RESOLVE'}</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* DISPATCH SPECIFICATIONS & CHANNELS */}
      <section className="neo-card-dashed font-mono">
        <div className="specs-header border-bottom padding-bottom-sm">
          <span className="editorial-tag font-bold">01 / ALERT DISPATCHER SPECIFICATIONS & CHANNELS</span>
        </div>

        <div className="specs-grid margin-top-md">
          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary">EVALUATION TRIGGERS</span>
            <span className="spec-card-body text-accent font-bold">Multi-dimensional Thresholds</span>
            <p className="spec-desc text-secondary">Hard metrics (&gt;85% CPU, &gt;90% RAM), Isolation Forest anomaly scores, and ML capacity forecasts.</p>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary">DISPATCH CHANNELS</span>
            <span className="spec-card-body text-primary font-bold">Webhooks, Slack, PagerDuty</span>
            <p className="spec-desc text-secondary">Asynchronous alert dispatching with emergency escalation routing.</p>
          </div>

          <div className="neo-card-inset spec-card">
            <span className="spec-card-title text-tertiary">FLAP PREVENTION</span>
            <span className="spec-card-body text-healthy font-bold">Enabled (15m Hysteresis)</span>
            <p className="spec-desc text-secondary">Automatic deduplication and alert flap dampening to prevent notification noise.</p>
          </div>
        </div>
      </section>

      <style>{`
        .margin-top-xs { margin-top: 6px; }
        .margin-top-md { margin-top: 20px; }
        .margin-bottom-xs { margin-bottom: 8px; }
        .margin-bottom-lg { margin-bottom: 28px; }

        .alert-filter-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .filter-left {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .filter-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .server-scope-selector {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--bg-inset);
          padding: 4px 8px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);
        }

        .alert-hero-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px;
          gap: 16px;
          flex-wrap: wrap;
        }

        .hero-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .hero-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .alert-icon-box {
          width: 44px;
          height: 44px;
          background: var(--bg-inset);
          box-shadow: var(--shadow-inset-sm);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .alert-title {
          font-size: 16px;
          font-weight: 800;
          color: var(--text-primary);
        }

        .alert-sub {
          font-size: 11px;
          margin-top: 2px;
        }

        .empty-alerts-card {
          padding: 42px 24px;
          text-align: center;
          border-radius: var(--radius-lg);
        }

        .empty-content {
          max-width: 540px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .empty-title {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .empty-desc {
          margin-top: 6px;
          line-height: 1.5;
        }

        .alerts-grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .alert-card {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: all 0.2s ease;
        }

        .alert-card.severity-critical {
          border-left: 4px solid var(--status-critical, #ef4444);
        }

        .alert-card.severity-warning {
          border-left: 4px solid var(--status-warning, #f59e0b);
        }

        .alert-card.severity-info {
          border-left: 4px solid var(--accent, #3b82f6);
        }

        .alert-card.status-resolved {
          opacity: 0.7;
          border-left: 4px solid var(--status-healthy, #10b981);
        }

        .alert-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }

        .header-tags {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .header-time {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .alert-card-title {
          font-size: 15px;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .alert-card-msg {
          font-size: 13px;
          line-height: 1.5;
        }

        .alert-meta-row {
          display: flex;
          gap: 16px;
          margin-top: 8px;
          flex-wrap: wrap;
        }

        .alert-card-footer {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }

        .specs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
        }

        .spec-card {
          padding: 16px;
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .spec-card-title {
          font-size: 10px;
          letter-spacing: 0.08em;
        }

        .spec-card-body {
          font-size: 13px;
        }

        .spec-desc {
          font-size: 11px;
          line-height: 1.4;
          margin-top: 4px;
        }

        .error-banner {
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
        }

        .neo-btn-sm {
          padding: 4px 10px;
          font-size: 11px;
          font-family: inherit;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);
          background: var(--bg-card);
          color: var(--text-secondary);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s ease;
        }

        .neo-btn-sm:hover:not(:disabled) {
          color: var(--text-primary);
          border-color: var(--text-tertiary);
        }

        .neo-btn-sm.active {
          background: var(--accent);
          color: #ffffff;
          border-color: var(--accent);
        }

        .neo-btn-healthy {
          color: var(--status-healthy);
          border-color: rgba(16, 185, 129, 0.3);
        }

        .neo-btn-healthy:hover:not(:disabled) {
          background: rgba(16, 185, 129, 0.1);
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .border-bottom { border-bottom: 1px solid var(--border-subtle); }
        .border-top { border-top: 1px solid var(--border-subtle); }
        .padding-bottom-sm { padding-bottom: 10px; }
        .padding-top-xs { padding-top: 8px; }

        .text-accent { color: var(--accent); }
        .text-healthy { color: var(--status-healthy, #10b981); }
        .text-warning { color: var(--status-warning, #f59e0b); }
        .text-critical { color: var(--status-critical, #ef4444); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }
      `}</style>
    </div>
  );
}

export default AlertsPage;
