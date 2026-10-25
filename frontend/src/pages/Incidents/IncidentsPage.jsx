import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { useTimezone } from '../../context/TimezoneContext';
import {
  getIncidentsApi,
  createIncidentApi,
  updateIncidentApi,
  deleteIncidentApi,
  acknowledgeIncidentApi,
  resolveIncidentApi,
} from '../../services/incidents';
import {
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
  Plus,
  Check,
  X,
  Edit2,
  Trash2,
  Bell,
} from 'lucide-react';

const INCIDENT_STATUSES = [
  'OPEN',
  'INVESTIGATING',
  'ACKNOWLEDGED',
  'RESOLVED',
  'CLOSED',
];

const INCIDENT_SEVERITIES = [
  'CRITICAL',
  'WARNING',
  'INFO',
];

export function IncidentsPage() {
  const { servers, selectedHost } = useServer();
  const { user } = useAuth();
  const { formatTimestamp } = useTimezone();

  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Filters
  const [hostFilter, setHostFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');

  // Pending actions
  const [pendingIncidentId, setPendingIncidentId] = useState(null);

  // Create Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createSeverity, setCreateSeverity] = useState('WARNING');
  const [createServer, setCreateServer] = useState(selectedHost || 'ubuntu');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Edit Modal state
  const [editingIncident, setEditingIncident] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSeverity, setEditSeverity] = useState('WARNING');
  const [editStatus, setEditStatus] = useState('OPEN');
  const [editServer, setEditServer] = useState('ubuntu');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Role permissions
  const isOperatorOrAdmin = user?.role === 'ADMIN' || user?.role === 'OPERATOR';

  // Fetch incidents
  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = {};
      if (hostFilter !== 'all') queryParams.server = hostFilter;
      if (statusFilter !== 'all') queryParams.status = statusFilter;
      if (severityFilter !== 'all') queryParams.severity = severityFilter;

      const data = await getIncidentsApi(queryParams);
      setIncidents(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  }, [hostFilter, statusFilter, severityFilter]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  // Acknowledge incident
  const handleAcknowledge = async (incidentId) => {
    if (!isOperatorOrAdmin || pendingIncidentId) return;
    setPendingIncidentId(incidentId);
    setFeedback(null);
    try {
      await acknowledgeIncidentApi(incidentId);
      setFeedback({ type: 'success', message: `Incident #${incidentId} acknowledged.` });
      await fetchIncidents();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.detail || `Failed to acknowledge incident #${incidentId}`,
      });
    } finally {
      setPendingIncidentId(null);
    }
  };

  // Resolve incident
  const handleResolve = async (incidentId) => {
    if (!isOperatorOrAdmin || pendingIncidentId) return;
    setPendingIncidentId(incidentId);
    setFeedback(null);
    try {
      await resolveIncidentApi(incidentId);
      setFeedback({ type: 'success', message: `Incident #${incidentId} resolved.` });
      await fetchIncidents();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.detail || `Failed to resolve incident #${incidentId}`,
      });
    } finally {
      setPendingIncidentId(null);
    }
  };

  // Delete incident
  const handleDelete = async (incidentId) => {
    if (!isOperatorOrAdmin || pendingIncidentId) return;
    if (!window.confirm(`Delete Incident #${incidentId}? This action cannot be undone.`)) return;

    setPendingIncidentId(incidentId);
    setFeedback(null);
    try {
      await deleteIncidentApi(incidentId);
      setFeedback({ type: 'success', message: `Incident #${incidentId} deleted.` });
      await fetchIncidents();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.detail || `Failed to delete incident #${incidentId}`,
      });
    } finally {
      setPendingIncidentId(null);
    }
  };

  // Submit Create Incident
  const handleCreateSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!createTitle.trim() || isSubmittingCreate || !isOperatorOrAdmin) return;

    setIsSubmittingCreate(true);
    setFeedback(null);
    try {
      const created = await createIncidentApi({
        title: createTitle.trim(),
        description: createDescription.trim(),
        severity: createSeverity,
        server: createServer || 'ubuntu',
      });

      setFeedback({
        type: 'success',
        message: `Incident #${created.id} created successfully.`,
      });
      setIsCreateModalOpen(false);
      setCreateTitle('');
      setCreateDescription('');
      await fetchIncidents();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.detail || 'Failed to create incident',
      });
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (inc) => {
    setEditingIncident(inc);
    setEditTitle(inc.title || '');
    setEditDescription(inc.description || '');
    setEditSeverity(inc.severity || 'WARNING');
    setEditStatus(inc.status || 'OPEN');
    setEditServer(inc.server || 'ubuntu');
  };

  // Submit Edit Incident (PATCH)
  const handleEditSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!editingIncident || isSubmittingEdit || !isOperatorOrAdmin) return;

    setIsSubmittingEdit(true);
    setFeedback(null);
    try {
      await updateIncidentApi(editingIncident.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        severity: editSeverity,
        status: editStatus,
        server: editServer,
      });

      setFeedback({
        type: 'success',
        message: `Incident #${editingIncident.id} updated successfully.`,
      });
      setEditingIncident(null);
      await fetchIncidents();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.detail || 'Failed to update incident',
      });
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const getStatusBadge = (status) => {
    const s = String(status || '').toUpperCase();
    if (s === 'RESOLVED' || s === 'CLOSED') {
      return <span className="nokia-badge badge-healthy">{s}</span>;
    }
    if (s === 'ACKNOWLEDGED') {
      return <span className="nokia-badge badge-neutral">Acknowledged</span>;
    }
    if (s === 'INVESTIGATING') {
      return <span className="nokia-badge badge-warning">Investigating</span>;
    }
    return <span className="nokia-badge badge-critical">{s || 'OPEN'}</span>;
  };

  const getSeverityBadge = (severity) => {
    const sev = String(severity || '').toUpperCase();
    if (sev === 'CRITICAL') return <span className="nokia-badge badge-critical">Critical</span>;
    if (sev === 'WARNING') return <span className="nokia-badge badge-warning">Warning</span>;
    return <span className="nokia-badge badge-neutral">Info</span>;
  };

  return (
    <div className="incidents-page font-sans">
      {/* Header */}
      <div className="page-header-block">
        <div className="header-actions-row">
          <div>
            <h1 className="page-title font-sans">Incidents</h1>
          </div>
          <div className="header-btn-group">
            <Link to="/alerts" className="nokia-btn font-sans">
              <Bell size={14} className="text-muted" />
              <span>Alerts Console</span>
            </Link>
            {isOperatorOrAdmin && (
              <button
                type="button"
                onClick={() => {
                  setCreateServer(selectedHost || 'ubuntu');
                  setIsCreateModalOpen(true);
                }}
                className="nokia-btn nokia-btn-primary font-sans"
              >
                <Plus size={13} />
                <span>New Incident</span>
              </button>
            )}
            <button
              type="button"
              onClick={fetchIncidents}
              disabled={loading}
              className="nokia-btn font-sans"
              title="Refresh incidents"
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

      {/* Filters Bar */}
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
            {INCIDENT_STATUSES.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
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
            {INCIDENT_SEVERITIES.map((sev) => (
              <option key={sev} value={sev}>{sev}</option>
            ))}
          </select>
        </div>

        <div className="incidents-count-pill font-sans text-xs">
          {incidents.length} incident{incidents.length === 1 ? '' : 's'} recorded
        </div>
      </div>

      {/* Incidents Table */}
      <div className="nokia-table-container margin-top-md">
        <table className="nokia-table">
          <thead>
            <tr>
              <th style={{ width: '60px' }}>ID</th>
              <th style={{ width: '100px' }}>Status</th>
              <th style={{ width: '80px' }}>Severity</th>
              <th>Title & Description</th>
              <th style={{ width: '90px' }}>Server</th>
              <th style={{ width: '90px' }}>Linked Alert</th>
              <th style={{ width: '130px' }}>Created</th>
              <th style={{ width: '180px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center text-muted py-6">
                  <div className="flex-center gap-2">
                    <RefreshCw size={14} className="spinning text-accent" />
                    <span>Loading incidents...</span>
                  </div>
                </td>
              </tr>
            ) : incidents.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted py-6">
                  No incidents match the selected filters.
                </td>
              </tr>
            ) : (
              incidents.map((inc) => {
                const isPending = pendingIncidentId === inc.id;
                const statusUpper = String(inc.status || '').toUpperCase();
                const canAcknowledge = statusUpper === 'OPEN' || statusUpper === 'TRIGGERED' || statusUpper === 'INVESTIGATING';
                const canResolve = statusUpper !== 'RESOLVED' && statusUpper !== 'CLOSED';

                return (
                  <tr key={inc.id}>
                    <td className="font-sans tabular-nums text-xs font-semibold">#{inc.id}</td>
                    <td>{getStatusBadge(inc.status)}</td>
                    <td>{getSeverityBadge(inc.severity)}</td>
                    <td>
                      <div className="incident-content-cell font-sans">
                        <span className="font-semibold text-primary">{inc.title}</span>
                        {inc.description && (
                          <span className="text-xs text-secondary mt-0.5">{inc.description}</span>
                        )}
                      </div>
                    </td>
                    <td className="font-medium text-xs">{inc.server || 'ubuntu'}</td>
                    <td>
                      {inc.alert_id != null ? (
                        <Link to="/alerts" className="linked-alert-pill font-sans text-xs" title={`Linked to Alert #${inc.alert_id}`}>
                          <Bell size={10} />
                          <span>Alert #{inc.alert_id}</span>
                        </Link>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="font-sans tabular-nums text-xs text-muted">
                      {inc.created_at ? formatTimestamp(new Date(inc.created_at).getTime() / 1000, true) : 'N/A'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="incident-actions-group">
                        {canAcknowledge && isOperatorOrAdmin && (
                          <button
                            type="button"
                            onClick={() => handleAcknowledge(inc.id)}
                            disabled={isPending}
                            className="nokia-btn nokia-btn-sm font-sans"
                            title="Acknowledge this incident"
                          >
                            <Check size={11} />
                            <span>{isPending ? '...' : 'Ack'}</span>
                          </button>
                        )}

                        {canResolve && isOperatorOrAdmin && (
                          <button
                            type="button"
                            onClick={() => handleResolve(inc.id)}
                            disabled={isPending}
                            className="nokia-btn nokia-btn-sm nokia-btn-healthy font-sans"
                            title="Resolve this incident"
                          >
                            <CheckCircle2 size={11} />
                            <span>{isPending ? '...' : 'Resolve'}</span>
                          </button>
                        )}

                        {isOperatorOrAdmin && (
                          <button
                            type="button"
                            onClick={() => openEditModal(inc)}
                            disabled={isPending}
                            className="nokia-btn nokia-btn-sm font-sans"
                            title="Edit incident details or status"
                          >
                            <Edit2 size={11} />
                          </button>
                        )}

                        {isOperatorOrAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDelete(inc.id)}
                            disabled={isPending}
                            className="nokia-btn nokia-btn-sm nokia-btn-danger font-sans"
                            title="Delete incident"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}

                        {!isOperatorOrAdmin && (
                          <span className="text-muted text-xs font-sans">Read-only</span>
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

      {/* Create Incident Modal */}
      {isCreateModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-panel font-sans">
            <div className="modal-header">
              <div className="flex-center gap-2">
                <ShieldAlert size={16} className="text-accent" />
                <h3 className="modal-title font-sans">Create Operational Incident</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="modal-close-btn"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="modal-body">
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  type="text"
                  required
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  className="nokia-input font-sans"
                  placeholder="e.g. Memory exhaustion on Ubuntu target node"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  required
                  rows={4}
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  className="nokia-textarea font-sans"
                  placeholder="Describe the operational incident context and mitigation steps..."
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">Severity</label>
                  <select
                    value={createSeverity}
                    onChange={(e) => setCreateSeverity(e.target.value)}
                    className="nokia-select font-sans w-full"
                  >
                    <option value="CRITICAL">Critical</option>
                    <option value="WARNING">Warning</option>
                    <option value="INFO">Info</option>
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label className="form-label">Server</label>
                  <select
                    value={createServer}
                    onChange={(e) => setCreateServer(e.target.value)}
                    className="nokia-select font-sans w-full"
                  >
                    {servers.map((s) => (
                      <option key={s.host} value={s.host}>{s.name} ({s.host})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isSubmittingCreate}
                  className="nokia-btn font-sans"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate || !createTitle.trim()}
                  className="nokia-btn nokia-btn-primary font-sans"
                >
                  {isSubmittingCreate ? (
                    <>
                      <RefreshCw size={12} className="spinning" />
                      <span>Creating...</span>
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

      {/* Edit Incident Modal (PATCH) */}
      {editingIncident && (
        <div className="modal-backdrop">
          <div className="modal-panel font-sans">
            <div className="modal-header">
              <div className="flex-center gap-2">
                <Edit2 size={16} className="text-accent" />
                <h3 className="modal-title font-sans">Update Incident #{editingIncident.id}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingIncident(null)}
                className="modal-close-btn"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="modal-body">
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="nokia-input font-sans"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  required
                  rows={4}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="nokia-textarea font-sans"
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="nokia-select font-sans w-full"
                  >
                    {INCIDENT_STATUSES.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label className="form-label">Severity</label>
                  <select
                    value={editSeverity}
                    onChange={(e) => setEditSeverity(e.target.value)}
                    className="nokia-select font-sans w-full"
                  >
                    <option value="CRITICAL">Critical</option>
                    <option value="WARNING">Warning</option>
                    <option value="INFO">Info</option>
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label className="form-label">Server</label>
                  <select
                    value={editServer}
                    onChange={(e) => setEditServer(e.target.value)}
                    className="nokia-select font-sans w-full"
                  >
                    {servers.map((s) => (
                      <option key={s.host} value={s.host}>{s.name} ({s.host})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setEditingIncident(null)}
                  disabled={isSubmittingEdit}
                  className="nokia-btn font-sans"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit || !editTitle.trim()}
                  className="nokia-btn nokia-btn-primary font-sans"
                >
                  {isSubmittingEdit ? (
                    <>
                      <RefreshCw size={12} className="spinning" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check size={12} />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .incidents-page {
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

        .incidents-count-pill {
          margin-left: auto;
          color: var(--text-tertiary);
          font-size: 11px;
        }

        .incident-content-cell {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .incident-actions-group {
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

        .nokia-btn-danger {
          color: var(--status-critical);
          border-color: rgba(239, 68, 68, 0.3);
        }
        .nokia-btn-danger:hover {
          background: rgba(239, 68, 68, 0.1);
          border-color: var(--status-critical);
        }

        .linked-alert-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 7px;
          border-radius: var(--radius-xs);
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.3);
          color: var(--status-warning);
          text-decoration: none;
          font-size: 11px;
          transition: all 0.15s ease;
        }

        .linked-alert-pill:hover {
          background: rgba(245, 158, 11, 0.22);
          border-color: var(--status-warning);
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

export default IncidentsPage;
