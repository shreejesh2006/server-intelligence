import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { useTimezone } from '../../context/TimezoneContext';
import { 
  getAlertsApi, 
  acknowledgeAlertApi, 
  resolveAlertApi, 
  evaluateAlertsApi,
  evaluatePredictiveAlertsApi,
} from '../../services/alerts';
import { getIncidentsApi, createIncidentApi } from '../../services/incidents';
import { 
  ArrowLeft, 
  RefreshCw, 
  CheckCircle2, 
  ShieldAlert, 
  Play, 
  TrendingUp,
  Check, 
  X, 
  ExternalLink,
  Plus
} from 'lucide-react';

export function AlertsPage() {
  const { selectedHost, servers } = useServer();
  const { user } = useAuth();
  const { formatTimestamp } = useTimezone();

  const [alerts, setAlerts] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Filters
  const [hostFilter, setHostFilter] = useState('all'); // 'all' | 'ubuntu'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'
  const [severityFilter, setSeverityFilter] = useState('all'); // 'all' | 'CRITICAL' | 'WARNING' | 'INFO'

  // Action state
  const [pendingAlertId, setPendingAlertId] = useState(null);
  const [evaluatingHost, setEvaluatingHost] = useState(false);
  const [evaluatingPredictive, setEvaluatingPredictive] = useState(false);

  // Escalate to Incident Modal state
  const [escalateModalAlert, setEscalateModalAlert] = useState(null);
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentSeverity, setIncidentSeverity] = useState('WARNING');
  const [isEscalating, setIsEscalating] = useState(false);

  // Role permissions
  const isOperatorOrAdmin = user?.role === 'ADMIN' || user?.role === 'OPERATOR';

  // Fetch alerts and linked incidents
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = {};
      if (hostFilter !== 'all') {
        queryParams.server = hostFilter;
      }
      if (statusFilter !== 'all') {
        queryParams.status = statusFilter;
      }
      if (severityFilter !== 'all') {
        queryParams.severity = severityFilter;
      }

      const [alertsRes, incidentsRes] = await Promise.all([
        getAlertsApi(queryParams).catch((err) => {
          throw err;
        }),
        getIncidentsApi().catch(() => []),
      ]);

      setAlerts(Array.isArray(alertsRes) ? alertsRes : []);
      setIncidents(Array.isArray(incidentsRes) ? incidentsRes : []);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to connect to alert service');
    } finally {
      setLoading(false);
    }
  }, [hostFilter, statusFilter, severityFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Map of alert_id -> incident object
  const incidentsByAlertId = React.useMemo(() => {
    const map = {};
    incidents.forEach((inc) => {
      if (inc.alert_id != null) {
        map[inc.alert_id] = inc;
      }
    });
    return map;
  }, [incidents]);

  // Acknowledge alert handler
  const handleAcknowledge = async (alertId) => {
    if (!isOperatorOrAdmin || pendingAlertId) return;
    setPendingAlertId(alertId);
    setFeedback(null);
    try {
      await acknowledgeAlertApi(alertId);
      setFeedback({ type: 'success', message: `Alert #${alertId} acknowledged.` });
      await fetchData();
    } catch (err) {
      setFeedback({ 
        type: 'error', 
        message: err?.response?.data?.detail || `Failed to acknowledge alert #${alertId}` 
      });
    } finally {
      setPendingAlertId(null);
    }
  };

  // Resolve alert handler
  const handleResolve = async (alertId) => {
    if (!isOperatorOrAdmin || pendingAlertId) return;
    setPendingAlertId(alertId);
    setFeedback(null);
    try {
      await resolveAlertApi(alertId);
      setFeedback({ type: 'success', message: `Alert #${alertId} resolved.` });
      await fetchData();
    } catch (err) {
      setFeedback({ 
        type: 'error', 
        message: err?.response?.data?.detail || `Failed to resolve alert #${alertId}` 
      });
    } finally {
      setPendingAlertId(null);
    }
  };

  // Trigger evaluation
  const handleEvaluate = async () => {
    if (!isOperatorOrAdmin || evaluatingHost) return;
    const target = hostFilter !== 'all' ? hostFilter : selectedHost || 'ubuntu';
    setEvaluatingHost(true);
    setFeedback(null);
    try {
      const res = await evaluateAlertsApi(target);
      const count = res?.new_alerts_created ?? 0;
      setFeedback({
        type: 'success',
        message: `Evaluation completed for ${target}: ${count} new alert(s) generated.`,
      });
      await fetchData();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.detail || `Failed to evaluate alerts for ${target}`,
      });
    } finally {
      setEvaluatingHost(false);
    }
  };

  // Trigger predictive forecast alert evaluation
  const handleEvaluatePredictive = async () => {
    if (!isOperatorOrAdmin || evaluatingPredictive) return;
    const target = hostFilter !== 'all' ? hostFilter : undefined;
    setEvaluatingPredictive(true);
    setFeedback(null);
    try {
      const res = await evaluatePredictiveAlertsApi(target);
      const created = res?.alerts_created ?? 0;
      const updated = res?.alerts_updated ?? 0;
      const resolved = res?.alerts_resolved ?? 0;
      setFeedback({
        type: 'success',
        message: `Predictive forecast evaluation completed: ${created} created, ${updated} updated, ${resolved} resolved.`,
      });
      await fetchData();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.detail || 'Failed to evaluate predictive alerts',
      });
    } finally {
      setEvaluatingPredictive(false);
    }
  };

  // Open Escalate Modal
  const openEscalateModal = (alertItem) => {
    setEscalateModalAlert(alertItem);
    setIncidentTitle(`Incident: ${alertItem.title || alertItem.message}`);
    setIncidentDescription(
      alertItem.message 
        ? `${alertItem.message}\n(Triggered by metric: ${alertItem.metric || 'N/A'}, source: ${alertItem.source})`
        : `Triggered by Alert #${alertItem.id}`
    );
    setIncidentSeverity(alertItem.severity || 'WARNING');
  };

  // Close Escalate Modal
  const closeEscalateModal = () => {
    setEscalateModalAlert(null);
    setIsEscalating(false);
  };

  // Submit Escalate to Incident
  const handleSubmitIncident = async (e) => {
    if (e) e.preventDefault();
    if (!escalateModalAlert || isEscalating || !isOperatorOrAdmin) return;

    setIsEscalating(true);
    setFeedback(null);
    try {
      const created = await createIncidentApi({
        title: incidentTitle.trim(),
        description: incidentDescription.trim(),
        severity: incidentSeverity,
        server: escalateModalAlert.server || selectedHost || 'ubuntu',
        alert_id: escalateModalAlert.id,
      });

      setFeedback({
        type: 'success',
        message: `Incident #${created.id} ("${created.title}") successfully created from Alert #${escalateModalAlert.id}.`,
      });
      closeEscalateModal();
      await fetchData();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.detail || 'Failed to create incident from alert',
      });
      setIsEscalating(false);
    }
  };

  const getStatusBadge = (status) => {
    const s = String(status || '').toUpperCase();
    if (s === 'RESOLVED') return <span className="nokia-badge badge-healthy">Resolved</span>;
    if (s === 'ACKNOWLEDGED') return <span className="nokia-badge badge-neutral">Acknowledged</span>;
    return <span className="nokia-badge badge-warning">Active</span>;
  };

  const getSeverityBadge = (severity) => {
    const sev = String(severity || '').toUpperCase();
    if (sev === 'CRITICAL') return <span className="nokia-badge badge-critical">Critical</span>;
    if (sev === 'WARNING') return <span className="nokia-badge badge-warning">Warning</span>;
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
        <div className="header-actions-row">
          <div>
            <h1 className="page-title font-sans">Alerts & Incidents</h1>
            <p className="page-subtitle font-sans">
              Real-time operational alerts from rule evaluations and Isolation Forest anomalies.
            </p>
          </div>
          <div className="header-btn-group">
            <Link to="/incidents" className="nokia-btn font-sans">
              <ShieldAlert size={14} className="text-muted" />
              <span>Incidents Console</span>
            </Link>
            {isOperatorOrAdmin && (
              <>
                <button
                  type="button"
                  onClick={handleEvaluate}
                  disabled={evaluatingHost || evaluatingPredictive || loading}
                  className="nokia-btn font-sans"
                  title="Run threshold rules and ML anomaly evaluation now"
                >
                  <Play size={13} className={evaluatingHost ? 'spinning text-accent' : ''} />
                  <span>{evaluatingHost ? 'Evaluating...' : 'Evaluate Rules'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleEvaluatePredictive}
                  disabled={evaluatingHost || evaluatingPredictive || loading}
                  className="nokia-btn font-sans"
                  title="Run forecast model evaluation for predictive threshold breaches"
                >
                  <TrendingUp size={13} className={evaluatingPredictive ? 'spinning text-accent' : ''} />
                  <span>{evaluatingPredictive ? 'Predicting...' : 'Evaluate Forecasts'}</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="nokia-btn font-sans"
              title="Refresh alert list"
            >
              <RefreshCw size={13} className={loading ? 'spinning text-accent' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notifications / Feedback Banner */}
      {feedback && (
        <div className={`feedback-banner ${feedback.type === 'success' ? 'feedback-success' : 'feedback-error'} font-sans text-xs`}>
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} className="feedback-close-btn">
            <X size={12} />
          </button>
        </div>
      )}

      {error && <div className="error-banner font-sans text-xs">{error}</div>}

      {/* Filter Bar */}
      <div className="filters-bar font-sans">
        <div className="filter-group">
          <span className="filter-label">Server:</span>
          <select 
            value={hostFilter} 
            onChange={(e) => setHostFilter(e.target.value)}
            className="nokia-select font-sans"
          >
            <option value="all">All Servers</option>
            {servers.map((s) => (
              <option key={s.host} value={s.host}>{s.name} ({s.host})</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <span className="filter-label">Status:</span>
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="nokia-select font-sans"
          >
            <option value="all">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>

        <div className="filter-group">
          <span className="filter-label">Severity:</span>
          <select 
            value={severityFilter} 
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="nokia-select font-sans"
          >
            <option value="all">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="WARNING">Warning</option>
            <option value="INFO">Info</option>
          </select>
        </div>

        <div className="alerts-count-pill font-mono text-xs">
          {alerts.length} alert{alerts.length === 1 ? '' : 's'} recorded
        </div>
      </div>

      {/* Operational Alerts Table */}
      <div className="nokia-table-container margin-top-md">
        <table className="nokia-table">
          <thead>
            <tr>
              <th style={{ width: '90px' }}>Status</th>
              <th style={{ width: '80px' }}>Severity</th>
              <th>Alert Title & Details</th>
              <th style={{ width: '100px' }}>Source</th>
              <th style={{ width: '100px' }}>Server</th>
              <th style={{ width: '140px' }}>Triggered Time</th>
              <th style={{ width: '230px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center text-muted py-6">
                  <div className="flex-center gap-2">
                    <RefreshCw size={14} className="spinning text-accent" />
                    <span>Loading operational alerts...</span>
                  </div>
                </td>
              </tr>
            ) : alerts.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted py-6">
                  No alerts match the selected criteria.
                </td>
              </tr>
            ) : (
              alerts.map((alertItem) => {
                const isPending = pendingAlertId === alertItem.id;
                const statusUpper = String(alertItem.status || '').toUpperCase();
                const canAcknowledge = statusUpper === 'ACTIVE';
                const canResolve = statusUpper === 'ACTIVE' || statusUpper === 'ACKNOWLEDGED';
                const linkedIncident = incidentsByAlertId[alertItem.id];

                return (
                  <tr key={alertItem.id}>
                    <td>{getStatusBadge(alertItem.status)}</td>
                    <td>{getSeverityBadge(alertItem.severity)}</td>
                    <td>
                      <div className="alert-content-cell">
                        <div className="flex-center gap-1.5">
                          {alertItem.source === 'predictive_forecast' && (
                            <span className="nokia-badge font-mono text-xs" style={{ background: 'var(--accent-dim, rgba(0, 106, 255, 0.15))', color: 'var(--accent, #006aff)', border: '1px solid var(--accent, #006aff)' }}>
                              PREDICTIVE
                            </span>
                          )}
                          <span className="font-semibold text-primary">
                            {alertItem.title || alertItem.message}
                          </span>
                        </div>
                        {alertItem.message && alertItem.title && alertItem.message !== alertItem.title && (
                          <span className="text-xs text-secondary mt-0.5">{alertItem.message}</span>
                        )}
                        {alertItem.metric && (
                          <div className="alert-metric-tag font-mono text-xs text-muted">
                            Metric: {alertItem.metric}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="font-mono text-xs text-muted">
                      {alertItem.source === 'predictive_forecast' ? (
                        <span style={{ color: 'var(--accent, #006aff)', fontWeight: 500 }}>predictive</span>
                      ) : (
                        alertItem.source || 'system'
                      )}
                    </td>
                    <td className="font-medium text-xs">{alertItem.server || 'ubuntu'}</td>
                    <td className="font-mono text-xs text-muted">
                      {alertItem.created_at ? formatTimestamp(new Date(alertItem.created_at).getTime() / 1000, true) : 'N/A'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="alert-actions-group">
                        {/* Escalate to Incident or Linked Incident Pill */}
                        {linkedIncident ? (
                          <Link 
                            to="/incidents" 
                            className="linked-incident-pill font-mono text-xs" 
                            title={`Linked to Incident #${linkedIncident.id}: ${linkedIncident.title}`}
                          >
                            <ShieldAlert size={11} className="text-accent" />
                            <span>Inc #{linkedIncident.id}</span>
                            <ExternalLink size={10} />
                          </Link>
                        ) : isOperatorOrAdmin ? (
                          <button
                            type="button"
                            onClick={() => openEscalateModal(alertItem)}
                            disabled={isPending || isEscalating}
                            className="nokia-btn nokia-btn-sm font-sans"
                            title="Create a linked incident from this alert"
                          >
                            <Plus size={11} />
                            <span>Escalate</span>
                          </button>
                        ) : null}

                        {/* Acknowledge Button */}
                        {canAcknowledge && isOperatorOrAdmin && (
                          <button
                            type="button"
                            onClick={() => handleAcknowledge(alertItem.id)}
                            disabled={isPending}
                            className="nokia-btn nokia-btn-sm font-sans"
                            title="Acknowledge this active alert"
                          >
                            <Check size={11} />
                            <span>{isPending ? '...' : 'Ack'}</span>
                          </button>
                        )}

                        {/* Resolve Button */}
                        {canResolve && isOperatorOrAdmin && (
                          <button
                            type="button"
                            onClick={() => handleResolve(alertItem.id)}
                            disabled={isPending}
                            className="nokia-btn nokia-btn-sm nokia-btn-healthy font-sans"
                            title="Resolve this alert"
                          >
                            <CheckCircle2 size={11} />
                            <span>{isPending ? '...' : 'Resolve'}</span>
                          </button>
                        )}

                        {/* Read-only / Terminal State Indicator */}
                        {!isOperatorOrAdmin && (
                          <span className="text-muted text-xs font-mono">Read-only</span>
                        )}
                        {statusUpper === 'RESOLVED' && isOperatorOrAdmin && (
                          <span className="text-muted text-xs font-mono">Resolved</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Escalate to Incident Modal */}
      {escalateModalAlert && (
        <div className="modal-backdrop">
          <div className="modal-panel font-sans">
            <div className="modal-header">
              <div className="flex-center gap-2">
                <ShieldAlert size={16} className="text-accent" />
                <h3 className="modal-title font-sans">Escalate Alert to Incident</h3>
              </div>
              <button type="button" onClick={closeEscalateModal} className="modal-close-btn">
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSubmitIncident} className="modal-body">
              <div className="form-group">
                <label className="form-label">Incident Title</label>
                <input
                  type="text"
                  required
                  value={incidentTitle}
                  onChange={(e) => setIncidentTitle(e.target.value)}
                  className="nokia-input font-sans"
                  placeholder="e.g. System CPU saturation detected"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description & Context</label>
                <textarea
                  required
                  rows={4}
                  value={incidentDescription}
                  onChange={(e) => setIncidentDescription(e.target.value)}
                  className="nokia-textarea font-sans"
                  placeholder="Details of the operational incident..."
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">Severity</label>
                  <select
                    value={incidentSeverity}
                    onChange={(e) => setIncidentSeverity(e.target.value)}
                    className="nokia-select font-sans w-full"
                  >
                    <option value="CRITICAL">Critical</option>
                    <option value="WARNING">Warning</option>
                    <option value="INFO">Info</option>
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label className="form-label">Target Server</label>
                  <input
                    type="text"
                    readOnly
                    value={escalateModalAlert.server || 'ubuntu'}
                    className="nokia-input font-mono text-muted"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Linked Alert ID</label>
                <input
                  type="text"
                  readOnly
                  value={`Alert #${escalateModalAlert.id} (${escalateModalAlert.title || escalateModalAlert.message})`}
                  className="nokia-input font-mono text-muted text-xs"
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={closeEscalateModal}
                  disabled={isEscalating}
                  className="nokia-btn font-sans"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEscalating || !incidentTitle.trim()}
                  className="nokia-btn nokia-btn-primary font-sans"
                >
                  {isEscalating ? (
                    <>
                      <RefreshCw size={12} className="spinning" />
                      <span>Creating Incident...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={12} />
                      <span>Create Incident</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .alerts-page {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .page-header-block {
          margin-bottom: 4px;
        }

        .header-actions-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .page-title {
          font-size: 24px;
          font-weight: 600;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .page-subtitle {
          font-size: 13px;
          color: var(--text-secondary);
          margin-top: 4px;
        }

        .header-btn-group {
          display: flex;
          align-items: center;
          gap: 8px;
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

        .filters-bar {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
          padding: 10px 14px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
        }

        .filter-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .filter-label {
          font-size: 12px;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .alerts-count-pill {
          margin-left: auto;
          color: var(--text-tertiary);
          font-size: 11px;
        }

        .alert-content-cell {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .alert-actions-group {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
        }

        .nokia-btn-sm {
          height: 26px;
          padding: 0 8px;
          font-size: 11px;
        }

        .nokia-btn-healthy {
          color: var(--status-healthy);
          border-color: rgba(34, 197, 94, 0.3);
        }
        .nokia-btn-healthy:hover {
          background: rgba(34, 197, 94, 0.1);
          border-color: var(--status-healthy);
        }

        .linked-incident-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 7px;
          border-radius: var(--radius-xs);
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.3);
          color: var(--accent-primary);
          text-decoration: none;
          font-size: 11px;
          transition: all 0.15s ease;
        }

        .linked-incident-pill:hover {
          background: rgba(59, 130, 246, 0.22);
          border-color: var(--accent-primary);
        }

        .feedback-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-radius: var(--radius-sm);
        }

        .feedback-success {
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: var(--status-healthy);
        }

        .feedback-error {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: var(--status-critical);
        }

        .feedback-close-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: inherit;
          padding: 2px;
          opacity: 0.7;
        }
        .feedback-close-btn:hover { opacity: 1; }

        .error-banner {
          padding: 10px 14px;
          background: var(--status-critical-bg);
          color: var(--status-critical);
          border-radius: var(--radius-sm);
        }

        /* Modal styling */
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
        }

        .modal-panel {
          width: 100%;
          max-width: 540px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .modal-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .modal-close-btn {
          background: none;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          padding: 4px;
        }
        .modal-close-btn:hover { color: var(--text-primary); }

        .modal-body {
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-row {
          display: flex;
          gap: 12px;
        }

        .flex-1 { flex: 1; }
        .w-full { width: 100%; }

        .form-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-secondary);
        }

        .nokia-input, .nokia-textarea {
          width: 100%;
          box-sizing: border-box;
          padding: 8px 12px;
          font-family: inherit;
          font-size: 12px;
          background: var(--bg-surface-hover);
          color: var(--text-primary);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xs);
        }
        .nokia-input:focus, .nokia-textarea:focus {
          outline: none;
          border-color: var(--accent-primary);
        }

        .modal-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          padding-top: 8px;
          border-top: 1px solid var(--border-subtle);
        }

        .margin-top-md { margin-top: 12px; }
        .text-center { text-align: center; }
        .text-primary { color: var(--text-primary); }
        .text-secondary { color: var(--text-secondary); }
        .text-muted { color: var(--text-tertiary); }
        .text-accent { color: var(--accent-primary); }
        .py-6 { padding-top: 24px; padding-bottom: 24px; }
        .flex-center { display: flex; align-items: center; }
        .gap-2 { gap: 8px; }
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default AlertsPage;
