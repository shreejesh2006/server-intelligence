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
  Zap,
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

  const formatTriggerLabel = (val) => {
    const found = TRIGGER_TYPES.find((t) => t.value === val);
    return found ? found.label : val;
  };

  const formatActionLabel = (val) => {
    const found = ALLOWLISTED_ACTIONS.find((a) => a.value === val);
    return found ? found.label : val;
  };

  return (
    <div className="netra-automations-page font-sans">
      {/* 1. PAGE HEADER */}
      <div className="dashboard-main-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 className="header-page-title font-sans">Automations</h1>
          <span
            className="text-xs px-2 py-0.5 rounded border border-slate-500/30 text-slate-400 bg-slate-500/10 font-sans"
            style={{ fontSize: '11px', letterSpacing: '0.02em' }}
          >
            Policy Engine
          </span>
        </div>

        <div className="header-actions-group">
          {isOperatorOrAdmin && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="action-btn primary-btn font-sans"
            >
              <Plus size={13} />
              <span>New Rule</span>
            </button>
          )}
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="action-btn font-sans"
            title="Refresh automations"
          >
            <RefreshCw size={13} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div className={`feedback-alert ${feedback.type === 'success' ? 'alert-success' : 'alert-error'} font-sans`}>
          {feedback.type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {error && (
        <div className="feedback-alert alert-error font-sans">
          <XCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* 2. CONFIGURED RULES PANEL */}
      <div className="netra-panel">
        <div className="panel-title-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 className="panel-title font-sans">Configured Rules</h2>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} className="font-sans">
              ({automations.length})
            </span>
          </div>
        </div>

        <div className="table-responsive">
          <table className="netra-table font-sans">
            <thead>
              <tr>
                <th style={{ width: '90px' }}>Status</th>
                <th>Rule Name</th>
                <th style={{ width: '200px' }}>Trigger</th>
                <th style={{ width: '220px' }}>Action</th>
                <th style={{ width: '150px' }}>Created</th>
                <th style={{ width: '160px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && automations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-empty-cell">
                    <RefreshCw size={14} className="spinning inline mr-2" />
                    <span>Loading rules...</span>
                  </td>
                </tr>
              ) : automations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-empty-cell">
                    No automation rules configured.
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
                        <div className="rule-name-cell font-medium">{auto.name}</div>
                      </td>
                      <td>
                        <span className="trigger-badge font-sans">{formatTriggerLabel(auto.trigger_type)}</span>
                      </td>
                      <td>
                        <span className="action-tag font-sans">{formatActionLabel(auto.action_type)}</span>
                      </td>
                      <td className="tabular-nums text-muted text-xs">
                        {auto.created_at ? formatTimestamp(new Date(auto.created_at).getTime() / 1000, true, false) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="table-action-btns">
                          {isOperatorOrAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleExecute(auto)}
                                disabled={executingId === auto.id || loading}
                                className="row-action-btn font-sans"
                                title="Run rule now"
                              >
                                <Play size={11} className={executingId === auto.id ? 'spinning' : ''} />
                                <span>Run</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(auto)}
                                className="row-action-btn font-sans"
                                title={isEnabled ? 'Disable rule' : 'Enable rule'}
                              >
                                <Power size={11} />
                                <span>{isEnabled ? 'Disable' : 'Enable'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(auto.id, auto.name)}
                                className="row-action-btn row-btn-delete font-sans"
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

      {/* 3. EXECUTION HISTORY PANEL */}
      <div className="netra-panel">
        <div className="panel-title-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 className="panel-title font-sans">Execution History</h2>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} className="font-sans">
              ({runs.length})
            </span>
          </div>
        </div>

        <div className="table-responsive">
          <table className="netra-table font-sans">
            <thead>
              <tr>
                <th style={{ width: '70px' }}>Run ID</th>
                <th style={{ width: '90px' }}>Status</th>
                <th style={{ width: '90px' }}>Type</th>
                <th>Result Summary</th>
                <th style={{ width: '160px' }}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {loading && runs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-empty-cell">
                    <RefreshCw size={14} className="spinning inline mr-2" />
                    <span>Loading execution history...</span>
                  </td>
                </tr>
              ) : runs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-empty-cell">
                    No execution history recorded.
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
                      <td className="tabular-nums text-muted text-xs">#{run.id}</td>
                      <td>
                        <span className={`nokia-badge ${isSuccess ? 'badge-healthy' : isFailed ? 'badge-critical' : 'badge-neutral'}`}>
                          {run.status}
                        </span>
                      </td>
                      <td>
                        <span className="nokia-badge badge-neutral font-sans text-xs">
                          {isRecOnly ? 'PROPOSAL' : 'EXECUTED'}
                        </span>
                      </td>
                      <td>
                        <div className="run-summary-cell font-sans">
                          <div className="run-primary-text font-medium text-xs">
                            {parsed?.summary || parsed?.reason || parsed?.error || run.output || 'Completed'}
                          </div>
                          {parsed?.recommendations && parsed.recommendations.length > 0 && (
                            <div className="run-recs-text text-xs text-muted">
                              <span className="font-medium">Recommendations: </span>
                              {parsed.recommendations.join('; ')}
                            </div>
                          )}
                          {(parsed?.target_host || parsed?.duration_ms != null) && (
                            <div className="run-meta-strip tabular-nums text-muted text-xs">
                              {parsed?.target_host && <span>Host: {parsed.target_host}</span>}
                              {parsed?.duration_ms != null && <span>Duration: {parsed.duration_ms}ms</span>}
                              {parsed?.trigger_alert_id && <span>Alert ID: #{parsed.trigger_alert_id}</span>}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="tabular-nums text-muted text-xs">
                        {run.created_at ? formatTimestamp(new Date(run.created_at).getTime() / 1000, true, false) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. CREATE AUTOMATION MODAL */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="modal-dialog font-sans" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title font-sans">New Automation Rule</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="form-group">
                <label className="form-label font-sans">Rule Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Memory Spike Diagnostic Trigger"
                  className="form-input font-sans"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label font-sans">Trigger Type</label>
                <select
                  value={newTrigger}
                  onChange={(e) => setNewTrigger(e.target.value)}
                  className="form-select font-sans"
                >
                  {TRIGGER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label font-sans">Action to Execute</label>
                <select
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  className="form-select font-sans"
                >
                  {ALLOWLISTED_ACTIONS.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>

              <div className="modal-actions-bar">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary font-sans"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newName.trim()}
                  className="btn-primary font-sans"
                >
                  {isSubmitting ? 'Creating...' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .netra-automations-page {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .dashboard-main-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 2px;
        }

        .header-page-title {
          font-size: 24px;
          font-weight: 600;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .header-actions-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: var(--radius-xs);
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .action-btn:hover:not(:disabled) {
          color: var(--text-primary);
          background: var(--bg-surface-hover);
        }

        .action-btn.primary-btn {
          background: var(--text-primary);
          color: var(--bg-surface);
          border-color: var(--text-primary);
        }

        .action-btn.primary-btn:hover {
          opacity: 0.9;
        }

        /* Feedback Alerts */
        .feedback-alert {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: var(--radius-xs);
          font-size: 12px;
        }

        .alert-success {
          background: rgba(34, 197, 94, 0.08);
          color: var(--status-healthy);
          border: 1px solid rgba(34, 197, 94, 0.2);
        }

        .alert-error {
          background: rgba(239, 68, 68, 0.08);
          color: var(--status-critical);
          border: 1px solid rgba(239, 68, 68, 0.2);
        }

        /* Panel & Table System */
        .netra-panel {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }

        .panel-title-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .panel-title {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.01em;
          color: var(--text-primary);
        }

        .table-responsive {
          width: 100%;
          overflow-x: auto;
        }

        .netra-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 12px;
        }

        .netra-table th {
          padding: 8px 14px;
          font-size: 11px;
          font-weight: 500;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border-subtle);
          background-color: var(--bg-canvas);
        }

        .netra-table td {
          padding: 10px 14px;
          border-bottom: 1px solid var(--border-subtle);
          color: var(--text-primary);
          vertical-align: middle;
        }

        .netra-table tr:last-child td {
          border-bottom: none;
        }

        .netra-table tr:hover td {
          background-color: var(--bg-surface-hover);
        }

        .table-empty-cell {
          text-align: center;
          color: var(--text-muted);
          padding: 32px 14px;
          font-size: 12px;
        }

        .rule-name-cell {
          font-size: 12px;
          color: var(--text-primary);
        }

        .trigger-badge {
          font-size: 11px;
          color: var(--text-secondary);
        }

        .action-tag {
          font-size: 11px;
          color: var(--text-secondary);
        }

        .table-action-btns {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .row-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          font-size: 11px;
          font-weight: 500;
          border-radius: var(--radius-xs);
          border: 1px solid var(--border-subtle);
          background: var(--bg-canvas);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .row-action-btn:hover {
          color: var(--text-primary);
          background: var(--bg-surface-hover);
        }

        .row-btn-delete:hover {
          color: var(--status-critical);
          border-color: rgba(239, 68, 68, 0.3);
        }

        /* Summary cell */
        .run-summary-cell {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .run-meta-strip {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 2px;
        }

        /* Modal Dialog */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(2px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }

        .modal-dialog {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          width: 100%;
          max-width: 440px;
          padding: 20px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .modal-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }

        .modal-close-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 14px;
          cursor: pointer;
          padding: 4px;
        }

        .modal-close-btn:hover {
          color: var(--text-primary);
        }

        .form-group {
          margin-bottom: 14px;
        }

        .form-label {
          display: block;
          font-size: 11px;
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: 5px;
        }

        .form-input {
          width: 100%;
          padding: 7px 10px;
          background: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xs);
          color: var(--text-primary);
          font-size: 12px;
          outline: none;
        }

        .form-input:focus {
          border-color: var(--border-strong);
        }

        .form-select {
          width: 100%;
          padding: 7px 10px;
          background: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xs);
          color: var(--text-primary);
          font-size: 12px;
          outline: none;
          cursor: pointer;
        }

        .modal-actions-bar {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 20px;
        }

        .btn-secondary {
          padding: 6px 14px;
          background: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xs);
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
        }

        .btn-secondary:hover {
          color: var(--text-primary);
          background: var(--bg-surface-hover);
        }

        .btn-primary {
          padding: 6px 14px;
          background: var(--text-primary);
          color: var(--bg-surface);
          border: 1px solid var(--text-primary);
          border-radius: var(--radius-xs);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
        }

        .btn-primary:hover:not(:disabled) {
          opacity: 0.9;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
