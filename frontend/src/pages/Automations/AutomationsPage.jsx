import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useServer } from '../../context/ServerContext';
import {
  getAutomationsApi,
  createAutomationApi,
  updateAutomationApi,
  deleteAutomationApi,
  executeAutomationApi,
  getAutomationRunsApi,
} from '../../services/automations';
import {
  RefreshCw,
  Plus,
  Play,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Power,
} from 'lucide-react';

const ALLOWLISTED_ACTIONS = [
  { value: 'LOG_EVENT', label: 'Log Diagnostic Event', description: 'Persists structured alert and prediction evidence to audit logs.' },
  { value: 'COLLECT_DIAGNOSTICS', label: 'Collect Telemetry Diagnostics', description: 'Performs read-only telemetry and anomaly collection without shell access.' },
  { value: 'RECOMMEND_REMEDIATION', label: 'Propose Remediation Recommendation', description: 'Generates non-destructive guidance for operators without auto-execution.' },
];

const TRIGGER_TYPES = [
  { value: 'predictive_alert', label: 'Predictive Alert (Impending Breach)' },
  { value: 'threshold', label: 'Reactive Threshold Breach' },
  { value: 'anomaly', label: 'Isolation Forest Anomaly' },
  { value: 'all', label: 'All Telemetry Triggers' },
];

export default function AutomationsPage() {
  const { user } = useAuth();
  const { formatTimestamp } = useTimezone();
  const { selectedHost } = useServer();

  const isOperatorOrAdmin = user?.role === 'ADMIN' || user?.role === 'OPERATOR';

  const [automations, setAutomations] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTrigger, setNewTrigger] = useState('predictive_alert');
  const [newAction, setNewAction] = useState('LOG_EVENT');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Active executing ID
  const [executingId, setExecutingId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [autosRes, runsRes] = await Promise.all([
        getAutomationsApi().catch(() => []),
        getAutomationRunsApi(30).catch(() => []),
      ]);
      setAutomations(autosRes);
      setRuns(runsRes);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to connect to automation service');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Toggle Enabled/Disabled status
  const handleToggleStatus = async (autoItem) => {
    if (!isOperatorOrAdmin) return;
    const nextStatus = autoItem.status === 'ENABLED' ? 'DISABLED' : 'ENABLED';
    setFeedback(null);
    try {
      await updateAutomationApi(autoItem.id, { status: nextStatus });
      setFeedback({
        type: 'success',
        message: `Automation #${autoItem.id} ("${autoItem.name}") is now ${nextStatus}.`,
      });
      await fetchData();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.detail || 'Failed to update automation status',
      });
    }
  };

  // Delete automation
  const handleDelete = async (autoId, name) => {
    if (!isOperatorOrAdmin) return;
    if (!window.confirm(`Are you sure you want to delete automation "${name}"?`)) return;
    setFeedback(null);
    try {
      await deleteAutomationApi(autoId);
      setFeedback({ type: 'success', message: `Automation "${name}" deleted.` });
      await fetchData();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.detail || 'Failed to delete automation',
      });
    }
  };

  // Manually run automation
  const handleExecute = async (autoItem) => {
    if (!isOperatorOrAdmin || executingId) return;
    setExecutingId(autoItem.id);
    setFeedback(null);
    try {
      const run = await executeAutomationApi(autoItem.id, { host: selectedHost || 'ubuntu' });
      setFeedback({
        type: 'success',
        message: `Execution Run #${run.id} initiated (${run.status}).`,
      });
      await fetchData();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.detail || 'Manual execution failed',
      });
    } finally {
      setExecutingId(null);
    }
  };

  // Create automation handler
  const handleCreateSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!newName.trim() || isSubmitting || !isOperatorOrAdmin) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const created = await createAutomationApi({
        name: newName.trim(),
        trigger_type: newTrigger,
        action_type: newAction,
      });
      setFeedback({
        type: 'success',
        message: `Automation #${created.id} ("${created.name}") successfully created.`,
      });
      setShowCreateModal(false);
      setNewName('');
      await fetchData();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.detail || 'Failed to create automation rule',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const parseRunOutput = (rawOutput) => {
    if (!rawOutput) return null;
    try {
      return JSON.parse(rawOutput);
    } catch {
      return { summary: rawOutput };
    }
  };

  return (
    <div className="automations-page font-sans">
      {/* Header */}
      <div className="page-header-block">
        <div className="header-actions-row">
          <div>
            <h1 className="page-title font-sans">Automations</h1>
          </div>
          <div className="header-btn-group">
            {isOperatorOrAdmin && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="nokia-btn nokia-btn-primary font-sans"
              >
                <Plus size={14} />
                <span>New Rule</span>
              </button>
            )}
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="nokia-btn font-sans"
              title="Refresh automations"
            >
              <RefreshCw size={13} className={loading ? 'spinning' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div className={`feedback-banner ${feedback.type === 'success' ? 'feedback-success' : 'feedback-error'}`}>
          <div className="flex-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            <span>{feedback.message}</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="feedback-banner feedback-error">
          <div className="flex-center gap-2">
            <XCircle size={15} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Automations Table */}
      <div className="margin-top-md">
        <div className="flex-between margin-bottom-sm">
          <h2 className="font-semibold text-sm text-primary font-sans">Configured Rules</h2>
          <span className="text-xs text-muted font-sans">{automations.length} rule{automations.length === 1 ? '' : 's'}</span>
        </div>

        <div className="nokia-table-container">
          <table className="nokia-table">
            <thead>
              <tr>
                <th style={{ width: '90px' }}>Status</th>
                <th>Rule Name</th>
                <th style={{ width: '180px' }}>Trigger</th>
                <th style={{ width: '220px' }}>Action</th>
                <th style={{ width: '150px' }}>Created</th>
                <th style={{ width: '180px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && automations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-6">
                    <div className="flex-center gap-2">
                      <RefreshCw size={14} className="spinning" />
                      <span>Loading rules...</span>
                    </div>
                  </td>
                </tr>
              ) : automations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-6">
                    No automations configured.
                  </td>
                </tr>
              ) : (
                automations.map((auto) => {
                  const isEnabled = auto.status === 'ENABLED';
                  return (
                    <tr key={auto.id}>
                      <td>
                        <span className={`nokia-badge ${isEnabled ? 'badge-healthy' : 'badge-neutral'}`}>
                          {auto.status}
                        </span>
                      </td>
                      <td>
                        <div className="font-semibold text-primary">{auto.name}</div>
                      </td>
                      <td>
                        <span className="font-sans text-xs text-secondary">{auto.trigger_type}</span>
                      </td>
                      <td>
                        <span className="nokia-badge font-sans text-xs">
                          {auto.action_type}
                        </span>
                      </td>
                      <td className="font-sans tabular-nums text-xs text-muted">
                        {auto.created_at ? formatTimestamp(new Date(auto.created_at).getTime() / 1000, true) : 'N/A'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="alert-actions-group" style={{ justifyContent: 'flex-end' }}>
                          {isOperatorOrAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleExecute(auto)}
                                disabled={executingId === auto.id || loading}
                                className="nokia-btn nokia-btn-sm font-sans"
                                title="Run rule"
                              >
                                <Play size={11} className={executingId === auto.id ? 'spinning' : ''} />
                                <span>Run</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(auto)}
                                className="nokia-btn nokia-btn-sm font-sans"
                                title={isEnabled ? 'Disable rule' : 'Enable rule'}
                              >
                                <Power size={11} />
                                <span>{isEnabled ? 'Disable' : 'Enable'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(auto.id, auto.name)}
                                className="nokia-btn nokia-btn-sm font-sans text-danger"
                                title="Delete rule"
                              >
                                <Trash2 size={11} />
                              </button>
                            </>
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
      </div>

      {/* Execution History Section */}
      <div className="margin-top-lg" style={{ marginTop: '28px' }}>
        <div className="flex-between margin-bottom-sm">
          <div>
            <h2 className="font-semibold text-sm text-primary font-sans">Execution History</h2>
          </div>
          <span className="text-xs text-muted font-sans">{runs.length} run{runs.length === 1 ? '' : 's'}</span>
        </div>

        <div className="nokia-table-container">
          <table className="nokia-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>Run ID</th>
                <th style={{ width: '90px' }}>Status</th>
                <th style={{ width: '90px' }}>Type</th>
                <th>Result Summary</th>
                <th style={{ width: '150px' }}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {loading && runs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-6">
                    <RefreshCw size={14} className="spinning inline mr-2" />
                    <span>Loading execution history...</span>
                  </td>
                </tr>
              ) : runs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-6">
                    No execution records logged.
                  </td>
                </tr>
              ) : (
                runs.map((run) => {
                  const parsed = parseRunOutput(run.output);
                  const isRecOnly = parsed?.type === 'RECOMMENDATION_ONLY';
                  const isSuccess = run.status === 'SUCCESS';
                  const isFailed = run.status === 'FAILED';

                  return (
                    <tr key={run.id}>
                      <td className="font-sans tabular-nums text-xs text-muted">#{run.id}</td>
                      <td>
                        <span className={`nokia-badge ${isSuccess ? 'badge-healthy' : isFailed ? 'badge-critical' : 'badge-neutral'}`}>
                          {run.status}
                        </span>
                      </td>
                      <td>
                        <span className="nokia-badge font-sans text-xs">
                          {isRecOnly ? 'PROPOSAL' : 'EXECUTED'}
                        </span>
                      </td>
                      <td>
                        <div className="alert-content-cell font-sans">
                          <span className="font-semibold text-primary text-xs">
                            {parsed?.summary || parsed?.reason || parsed?.error || run.output || 'No summary'}
                          </span>
                          {parsed?.recommendations && parsed.recommendations.length > 0 && (
                            <div className="mt-1 text-xs text-secondary">
                              <span className="font-medium text-muted">Next steps: </span>
                              {parsed.recommendations.join('; ')}
                            </div>
                          )}
                          {parsed?.target_host && (
                            <div className="flex-center gap-2 font-sans tabular-nums text-xs text-muted mt-0.5" style={{ justifyContent: 'flex-start' }}>
                              <span>Host: {parsed.target_host}</span>
                              {parsed?.trigger_alert_id && <span>Alert ID: #{parsed.trigger_alert_id}</span>}
                              {parsed?.duration_ms != null && <span>Duration: {parsed.duration_ms}ms</span>}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="font-sans tabular-nums text-xs text-muted">
                        {run.created_at ? formatTimestamp(new Date(run.created_at).getTime() / 1000, true) : 'N/A'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Automation Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '440px', width: '100%', padding: '20px' }}>
            <h3 className="font-semibold text-primary text-base margin-bottom-sm">New Automation Rule</h3>

            <form onSubmit={handleCreateSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label className="filter-label text-xs font-semibold block margin-bottom-xs">Rule Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. CPU Spike Diagnostics"
                  className="nokia-input font-sans w-full"
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="filter-label text-xs font-semibold block margin-bottom-xs">Trigger</label>
                <select
                  value={newTrigger}
                  onChange={(e) => setNewTrigger(e.target.value)}
                  className="nokia-select font-sans w-full"
                >
                  {TRIGGER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label className="filter-label text-xs font-semibold block margin-bottom-xs">Action</label>
                <select
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  className="nokia-select font-sans w-full"
                >
                  {ALLOWLISTED_ACTIONS.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex-between margin-top-md">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="nokia-btn font-sans"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newName.trim()}
                  className="nokia-btn nokia-btn-primary font-sans"
                >
                  {isSubmitting ? 'Creating...' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
