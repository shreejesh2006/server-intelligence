import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/common/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { 
  getUsersApi, 
  createUserApi, 
  updateUserRoleApi, 
  updateUserStatusApi 
} from '../../services/users';
import { 
  UserPlus, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  ShieldAlert,
  ShieldCheck,
  UserCheck, 
  UserX,
  Crown,
  Terminal,
  Eye,
  Shield,
  Lock,
  User,
  KeyRound,
  X
} from 'lucide-react';

export function UsersPage() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Create User Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('VIEWER');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Confirmation Modal state
  const [confirmDisableTarget, setConfirmDisableTarget] = useState(null);
  const [pendingUserId, setPendingUserId] = useState(null);

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUsersApi();
      setUsers(data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to fetch user accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim() || isCreating) return;

    if (newUsername.length < 3) {
      setCreateError('Username must be at least 3 characters.');
      return;
    }
    if (newPassword.length < 8) {
      setCreateError('Password must be at least 8 characters.');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const createdUser = await createUserApi({
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
      });

      setNotice(`User account '${createdUser.username}' created successfully.`);
      setNewUsername('');
      setNewPassword('');
      setNewRole('VIEWER');
      setShowCreateForm(false);
      fetchUsers();
    } catch (err) {
      setCreateError(err?.response?.data?.detail || 'Failed to register user account.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRoleChange = async (targetUserId, targetUsername, newRoleValue) => {
    if (targetUserId === currentUser?.id) {
      setNotice('Cannot modify your own active administrative role.');
      return;
    }
    if (pendingUserId) return;

    setPendingUserId(targetUserId);
    try {
      await updateUserRoleApi(targetUserId, newRoleValue);
      setNotice(`Updated role assignment for '${targetUsername}' to ${newRoleValue}.`);
      fetchUsers();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to update role assignment.');
    } finally {
      setPendingUserId(null);
    }
  };

  const executeStatusToggle = async (targetUserId, targetUsername, currentStatus) => {
    if (targetUserId === currentUser?.id) {
      setNotice('Cannot disable your own administrative session.');
      return;
    }
    if (pendingUserId) return;

    setPendingUserId(targetUserId);
    setConfirmDisableTarget(null);

    const nextStatus = !currentStatus;
    try {
      await updateUserStatusApi(targetUserId, nextStatus);
      setNotice(`User account '${targetUsername}' ${nextStatus ? 'enabled' : 'disabled'}.`);
      fetchUsers();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to update user status.');
    } finally {
      setPendingUserId(null);
    }
  };

  const onRequestStatusToggle = (targetUser) => {
    if (targetUser.id === currentUser?.id) {
      setNotice('Cannot disable your own administrative session.');
      return;
    }

    if (targetUser.is_active) {
      setConfirmDisableTarget(targetUser);
    } else {
      executeStatusToggle(targetUser.id, targetUser.username, false);
    }
  };

  const renderRoleBadge = (role) => {
    switch (role) {
      case 'ADMIN':
        return (
          <span className="role-pill pill-admin font-mono">
            <Crown size={12} className="text-warning" /> ADMIN
          </span>
        );
      case 'OPERATOR':
        return (
          <span className="role-pill pill-operator font-mono">
            <Terminal size={12} className="text-accent" /> OPERATOR
          </span>
        );
      case 'VIEWER':
      default:
        return (
          <span className="role-pill pill-viewer font-mono">
            <Eye size={12} className="text-info" /> VIEWER
          </span>
        );
    }
  };

  const renderUserAvatar = (role) => {
    switch (role) {
      case 'ADMIN':
        return (
          <div className="user-avatar-circle avatar-admin">
            <Crown size={15} className="text-warning" />
          </div>
        );
      case 'OPERATOR':
        return (
          <div className="user-avatar-circle avatar-operator">
            <Terminal size={15} className="text-accent" />
          </div>
        );
      case 'VIEWER':
      default:
        return (
          <div className="user-avatar-circle avatar-viewer">
            <Eye size={15} className="text-info" />
          </div>
        );
    }
  };

  const adminCount = users.filter((u) => u.role === 'ADMIN').length;
  const operatorCount = users.filter((u) => u.role === 'OPERATOR').length;
  const viewerCount = users.filter((u) => u.role === 'VIEWER').length;

  return (
    <div className="users-page font-sans">
      <PageHeader
        index="07"
        title="USER & ACCESS CONTROL"
        subtitle="Role-Based Access Control (RBAC) user account management and security policy matrix."
        tag="SECURITY REGISTRY"
      >
        <button
          type="button"
          onClick={() => setShowCreateForm((prev) => !prev)}
          className={`neo-btn ${showCreateForm ? 'neo-btn-active' : 'neo-btn-primary'}`}
        >
          <UserPlus size={14} />
          <span>{showCreateForm ? 'CLOSE REGISTRATION' : '+ PROVISION USER'}</span>
        </button>
      </PageHeader>

      {/* Global Alerts */}
      {notice && (
        <div className="editorial-notice-banner notice-success font-mono margin-top-md margin-bottom-md">
          <CheckCircle2 size={14} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="notice-close">✕</button>
        </div>
      )}

      {error && (
        <div className="editorial-notice-banner notice-error font-mono margin-top-md margin-bottom-md">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="notice-close">✕</button>
        </div>
      )}

      {/* SUMMARY STATISTICAL TILES */}
      <div className="users-summary-strip grid-4 font-mono margin-top-md margin-bottom-lg">
        <div className="neo-card-inset summary-stat-tile">
          <div className="stat-top text-tertiary text-xs flex-center gap-xs">
            <User size={14} className="text-accent" />
            <span>TOTAL ACCOUNTS</span>
          </div>
          <div className="stat-num font-bold text-primary margin-top-xs">
            {users.length} <span className="text-xs text-tertiary font-normal">USERS</span>
          </div>
          <div className="stat-sub text-healthy text-xs margin-top-xs">
            {users.filter((u) => u.is_active).length} ACTIVE SESSIONS
          </div>
        </div>

        <div className="neo-card-inset summary-stat-tile">
          <div className="stat-top text-tertiary text-xs flex-center gap-xs">
            <Crown size={14} className="text-warning" />
            <span>ADMINISTRATORS</span>
          </div>
          <div className="stat-num font-bold text-warning margin-top-xs">
            {adminCount} <span className="text-xs text-tertiary font-normal">ADMINS</span>
          </div>
          <div className="stat-sub text-tertiary text-xs margin-top-xs">
            FULL CONTROL PRIVILEGE
          </div>
        </div>

        <div className="neo-card-inset summary-stat-tile">
          <div className="stat-top text-tertiary text-xs flex-center gap-xs">
            <Terminal size={14} className="text-accent" />
            <span>SYSTEM OPERATORS</span>
          </div>
          <div className="stat-num font-bold text-accent margin-top-xs">
            {operatorCount} <span className="text-xs text-tertiary font-normal">OPERATORS</span>
          </div>
          <div className="stat-sub text-tertiary text-xs margin-top-xs">
            MONITORING & ALERT CONTROL
          </div>
        </div>

        <div className="neo-card-inset summary-stat-tile">
          <div className="stat-top text-tertiary text-xs flex-center gap-xs">
            <Eye size={14} className="text-info" />
            <span>READ-ONLY VIEWERS</span>
          </div>
          <div className="stat-num font-bold text-info margin-top-xs">
            {viewerCount} <span className="text-xs text-tertiary font-normal">VIEWERS</span>
          </div>
          <div className="stat-sub text-tertiary text-xs margin-top-xs">
            AUDIT & READ-ONLY ACCESS
          </div>
        </div>
      </div>

      {/* Deactivation Confirmation Modal */}
      {confirmDisableTarget && (
        <div className="confirm-modal-overlay">
          <div className="neo-card confirm-modal-card font-mono">
            <div className="modal-header border-bottom padding-bottom-xs">
              <ShieldAlert size={18} className="text-critical" />
              <h3 className="modal-title font-sans">CONFIRM USER DEACTIVATION</h3>
            </div>
            <p className="modal-body font-sans text-xs text-secondary margin-top-sm">
              Are you sure you want to disable account <strong>'{confirmDisableTarget.username}'</strong>? Deactivating will immediately revoke session access.
            </p>
            <div className="modal-actions margin-top-md">
              <button
                type="button"
                onClick={() => setConfirmDisableTarget(null)}
                className="neo-btn"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => executeStatusToggle(confirmDisableTarget.id, confirmDisableTarget.username, true)}
                className="neo-btn btn-danger"
              >
                DISABLE ACCOUNT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Creation Modal Popup */}
      {showCreateForm && (
        <div 
          className="provision-modal-backdrop font-mono"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateForm(false); }}
        >
          <div className="neo-card provision-modal-card">
            <div className="modal-header border-bottom padding-bottom-xs flex-between">
              <div className="title-box flex-center gap-xs">
                <div className="modal-icon-box">
                  <UserPlus size={18} className="text-accent" />
                </div>
                <div>
                  <h3 className="modal-title font-sans font-bold text-primary">PROVISION NEW USER ACCOUNT</h3>
                  <p className="modal-subtitle font-sans text-xs text-secondary margin-top-xs">
                    Register new user credentials and assign Role-Based Access Control privileges.
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="neo-icon-btn close-btn"
                title="Close window"
              >
                <X size={15} />
              </button>
            </div>

            {createError && (
              <div className="editorial-notice-banner notice-error margin-top-sm">
                <AlertCircle size={13} />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="margin-top-md">
              <div className="form-fields-stack">
                <div className="field-box">
                  <label htmlFor="new-username" className="field-label text-tertiary">
                    USERNAME (MIN 3 CHARS):
                  </label>
                  <div className="input-with-icon">
                    <User size={14} className="input-icon text-tertiary" />
                    <input
                      id="new-username"
                      type="text"
                      required
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="e.g. operator_john"
                      disabled={isCreating}
                      className="neo-input input-padded"
                    />
                  </div>
                </div>

                <div className="field-box margin-top-md">
                  <label htmlFor="new-password" className="field-label text-tertiary">
                    PASSWORD (MIN 8 CHARS):
                  </label>
                  <div className="input-with-icon">
                    <KeyRound size={14} className="input-icon text-tertiary" />
                    <input
                      id="new-password"
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={isCreating}
                      className="neo-input input-padded"
                    />
                  </div>
                </div>

                <div className="field-box margin-top-md">
                  <label htmlFor="new-role" className="field-label text-tertiary">ROLE ASSIGNMENT:</label>
                  <select
                    id="new-role"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    disabled={isCreating}
                    className="neo-select select-role-modal"
                  >
                    <option value="VIEWER">VIEWER (Read-Only Telemetry)</option>
                    <option value="OPERATOR">OPERATOR (Alert & Node Control)</option>
                    <option value="ADMIN">ADMIN (Full Administrative Control)</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer margin-top-lg padding-top-sm border-top flex-between">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="neo-btn"
                >
                  CANCEL
                </button>

                <button
                  type="submit"
                  disabled={isCreating || !newUsername.trim() || !newPassword.trim()}
                  className="neo-btn neo-btn-primary"
                >
                  {isCreating ? (
                    <>
                      <RefreshCw size={14} className="spin" />
                      <span>PROVISIONING ACCOUNT...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={14} />
                      <span>PROVISION ACCOUNT</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users Registry Table Card */}
      <section className="neo-card registry-card font-mono margin-bottom-lg">
        <div className="registry-header border-bottom padding-bottom-xs flex-between">
          <div>
            <span className="editorial-tag font-bold">01 / AUTHENTICATED USER ACCOUNTS REGISTRY</span>
            <p className="editorial-subtitle font-sans text-xs text-secondary margin-top-xs">
              Provisioned accounts and Role-Based Access Control privilege levels.
            </p>
          </div>
          <div className="header-actions flex-center gap-xs">
            <span className="editorial-pill pill-neutral">
              {users.length} REGISTERED {users.length === 1 ? 'ACCOUNT' : 'ACCOUNTS'}
            </span>
            <button
              type="button"
              onClick={fetchUsers}
              className={`neo-icon-btn ${loading ? 'spin' : ''}`}
              title="Refresh users list"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="users-loading-state font-mono padding-lg text-center">
            <RefreshCw size={18} className="spin text-accent margin-bottom-xs" />
            <p className="text-secondary text-xs">Querying security user registry...</p>
          </div>
        ) : (
          <div className="table-wrapper margin-top-md">
            <table className="user-table font-mono">
              <thead>
                <tr>
                  <th>ACCOUNT USER</th>
                  <th>ROLE ASSIGNMENT</th>
                  <th>ACCOUNT STATUS</th>
                  <th>CREATED AT</th>
                  <th className="text-right">SECURITY ACTION</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const isPending = pendingUserId === u.id;
                  const formattedDate = u.created_at
                    ? new Date(u.created_at).toISOString().replace('T', ' ').substring(0, 16) + ' UTC'
                    : 'N/A';

                  return (
                    <tr key={u.id} className={isSelf ? 'row-self' : ''}>
                      <td>
                        <div className="user-name-cell font-sans">
                          {renderUserAvatar(u.role)}
                          <div>
                            <div className="user-name font-bold text-primary flex-center gap-xs">
                              <span>{u.username}</span>
                              {isSelf && (
                                <span className="editorial-pill pill-healthy self-tag">
                                  <ShieldCheck size={10} /> YOU
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-tertiary font-mono">ID: #{u.id}</div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="role-cell-wrap font-mono">
                          {isSelf ? (
                            renderRoleBadge(u.role)
                          ) : (
                            <div className="interactive-role-picker">
                              <select
                                value={u.role}
                                disabled={isPending}
                                onChange={(e) => handleRoleChange(u.id, u.username, e.target.value)}
                                className={`neo-select role-select-pill role-pill-${u.role.toLowerCase()}`}
                                aria-label={`Change role assignment for user ${u.username}`}
                              >
                                <option value="ADMIN">ADMIN (Full Control)</option>
                                <option value="OPERATOR">OPERATOR (Alert & Node Control)</option>
                                <option value="VIEWER">VIEWER (Read-Only Audit)</option>
                              </select>
                            </div>
                          )}
                        </div>
                      </td>

                      <td>
                        {u.is_active ? (
                          <span className="editorial-pill pill-healthy font-mono">
                            <UserCheck size={11} /> ACTIVE
                          </span>
                        ) : (
                          <span className="editorial-pill pill-critical font-mono">
                            <UserX size={11} /> DISABLED
                          </span>
                        )}
                      </td>

                      <td className="text-tertiary text-xs font-mono">{formattedDate}</td>

                      <td className="text-right">
                        {isSelf ? (
                          <span className="editorial-pill pill-healthy font-mono">
                            <ShieldCheck size={12} /> ACTIVE SESSION
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => onRequestStatusToggle(u)}
                            className={`neo-btn text-xs ${u.is_active ? 'btn-action-revoke' : 'btn-action-restore'}`}
                          >
                            {isPending ? (
                              <>
                                <RefreshCw size={12} className="spin" />
                                <span>UPDATING...</span>
                              </>
                            ) : u.is_active ? (
                              <>
                                <UserX size={12} />
                                <span>REVOKE ACCESS</span>
                              </>
                            ) : (
                              <>
                                <UserCheck size={12} />
                                <span>RESTORE ACCESS</span>
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {users.length === 0 && (
                  <tr>
                    <td colSpan="5" className="empty-row text-tertiary text-center padding-md">
                      NO USER ACCOUNTS REGISTERED IN DATABASE
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* RBAC ROLE PRIVILEGE CAPABILITY MATRIX */}
      <section className="neo-card-dashed font-mono">
        <div className="specs-header border-bottom padding-bottom-sm flex-between">
          <span className="editorial-tag font-bold">02 / ROLE-BASED ACCESS CONTROL (RBAC) CAPABILITY MATRIX</span>
          <span className="editorial-pill pill-healthy">ENFORCED BY FASTAPI JWT GATEWAY</span>
        </div>

        <div className="specs-grid margin-top-md">
          <div className="neo-card-inset spec-card">
            <div className="flex-center gap-xs margin-bottom-xs">
              <Crown size={16} className="text-warning" />
              <span className="spec-card-title text-warning font-bold">ADMINISTRATOR</span>
            </div>
            <p className="spec-desc text-secondary text-xs">
              Full system control. Access user provisioning, AI model retraining, alert threshold updates, and configuration parameters.
            </p>
          </div>

          <div className="neo-card-inset spec-card">
            <div className="flex-center gap-xs margin-bottom-xs">
              <Terminal size={16} className="text-accent" />
              <span className="spec-card-title text-accent font-bold">SYSTEM OPERATOR</span>
            </div>
            <p className="spec-desc text-secondary text-xs">
              Infrastructure monitoring. Acknowledge alert triggers, inspect capacity forecasts, and run diagnostic queries.
            </p>
          </div>

          <div className="neo-card-inset spec-card">
            <div className="flex-center gap-xs margin-bottom-xs">
              <Eye size={16} className="text-info" />
              <span className="spec-card-title text-info font-bold">READ-ONLY VIEWER</span>
            </div>
            <p className="spec-desc text-secondary text-xs">
              Audit and read-only access. Inspect telemetry time-series charts, historical analytics, and anomaly scores.
            </p>
          </div>
        </div>
      </section>

      <style>{`
        .margin-top-xs { margin-top: 6px; }
        .margin-top-sm { margin-top: 10px; }
        .margin-top-md { margin-top: 20px; }
        .margin-bottom-xs { margin-bottom: 6px; }
        .margin-bottom-md { margin-bottom: 16px; }
        .margin-bottom-lg { margin-bottom: 28px; }
        .padding-bottom-xs { padding-bottom: 8px; }
        .padding-bottom-sm { padding-bottom: 12px; }
        .border-bottom { border-bottom: 1px solid var(--border-subtle); }
        .flex-center { display: flex; align-items: center; }
        .flex-between { display: flex; justify-content: space-between; align-items: center; }
        .flex-end { display: flex; justify-content: flex-end; }
        .gap-xs { gap: 6px; }
        .text-right { text-align: right; }

        .users-summary-strip {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .summary-stat-tile {
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .stat-num {
          font-size: 20px;
          line-height: 1.2;
        }

        .user-avatar-circle {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .avatar-admin {
          background: rgba(245, 158, 11, 0.15);
          border: 1px solid rgba(245, 158, 11, 0.35);
        }

        .avatar-operator {
          background: var(--accent-muted);
          border: 1px solid var(--accent-border);
        }

        .avatar-viewer {
          background: rgba(56, 189, 248, 0.15);
          border: 1px solid rgba(56, 189, 248, 0.35);
        }

        .role-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: var(--radius-pill);
          font-size: 10px;
          font-weight: 700;
        }

        .pill-admin {
          background: rgba(245, 158, 11, 0.12);
          color: var(--status-warning, #f59e0b);
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .pill-operator {
          background: var(--accent-muted);
          color: var(--accent);
          border: 1px solid var(--accent-border);
        }

        .pill-viewer {
          background: rgba(56, 189, 248, 0.12);
          color: var(--status-info, #38bdf8);
          border: 1px solid rgba(56, 189, 248, 0.3);
        }

        .role-cell-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .select-role-compact {
          height: 26px;
          font-size: 10px;
          padding: 0 6px;
        }

        .input-with-icon {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 10px;
          pointer-events: none;
        }

        .input-padded {
          padding-left: 32px !important;
          width: 100%;
        }

        .form-section {
          padding: 22px 24px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .field-box {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field-label {
          font-size: 10px;
          letter-spacing: 0.06em;
        }

        .registry-card {
          padding: 22px 24px;
        }

        .table-wrapper {
          overflow-x: auto;
        }

        .user-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }

        .user-table th {
          font-size: 10px;
          letter-spacing: 0.08em;
          color: var(--text-tertiary);
          border-bottom: 1px solid var(--border-strong);
          padding: 10px 12px;
        }

        .user-table td {
          padding: 12px;
          border-bottom: 1px solid var(--border-subtle);
          vertical-align: middle;
        }

        .row-self {
          background-color: var(--accent-muted);
        }

        .user-name-cell {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .user-name {
          font-size: 13px;
        }

        .self-tag {
          font-size: 9px;
        }

        .specs-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .spec-card {
          padding: 16px;
          border-radius: var(--radius-md);
        }

        .editorial-notice-banner {
          padding: 10px 14px;
          font-size: 11px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-radius: var(--radius-md);
        }

        .notice-success {
          background: var(--accent-muted);
          border: 1px solid var(--accent-border);
          color: var(--status-healthy);
        }

        .notice-error {
          background: rgba(220, 38, 38, 0.1);
          border: 1px solid rgba(220, 38, 38, 0.3);
          color: var(--status-critical);
        }

        .notice-close {
          margin-left: auto;
          background: transparent;
          border: none;
          color: inherit;
          cursor: pointer;
        }

        .confirm-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .provision-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
          animation: fadeIn 0.15s ease-out;
        }

        .provision-modal-card {
          width: 100%;
          max-width: 520px;
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-raised-lg);
          padding: 24px 28px;
          position: relative;
        }

        .modal-icon-box {
          width: 36px;
          height: 36px;
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          box-shadow: var(--shadow-inset-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .select-role-modal {
          width: 100%;
          height: 38px;
          padding: 0 12px;
          font-size: 12px;
          font-family: var(--font-mono);
          background: var(--bg-inset);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          box-shadow: var(--shadow-inset-sm);
          outline: none;
        }

        .select-role-modal:focus {
          border-color: var(--accent);
        }

        .modal-footer {
          margin-top: 28px !important;
          padding-top: 16px !important;
          border-top: 1px solid var(--border-subtle);
        }

        .role-select-pill {
          height: 28px;
          padding: 0 10px;
          font-size: 10px;
          font-weight: 700;
          font-family: var(--font-mono);
          border-radius: var(--radius-pill);
          cursor: pointer;
          transition: all 0.15s ease;
          outline: none;
        }

        .role-pill-admin {
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.4);
          color: var(--status-warning, #f59e0b);
        }

        .role-pill-operator {
          background: var(--accent-muted);
          border: 1px solid var(--accent-border);
          color: var(--accent);
        }

        .role-pill-viewer {
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.4);
          color: var(--status-info, #38bdf8);
        }

        .btn-action-revoke {
          background: rgba(220, 38, 38, 0.08);
          border: 1px solid rgba(220, 38, 38, 0.3);
          color: var(--status-critical);
          height: 28px;
          font-size: 10px;
          font-weight: 700;
          padding: 0 10px;
          gap: 6px;
          display: inline-flex;
          align-items: center;
          border-radius: var(--radius-md);
          transition: all 0.15s ease;
        }

        .btn-action-revoke:hover:not(:disabled) {
          background: rgba(220, 38, 38, 0.18);
          border-color: rgba(220, 38, 38, 0.6);
        }

        .btn-action-restore {
          background: var(--accent-muted);
          border: 1px solid var(--accent-border);
          color: var(--status-healthy);
          height: 28px;
          font-size: 10px;
          font-weight: 700;
          padding: 0 10px;
          gap: 6px;
          display: inline-flex;
          align-items: center;
          border-radius: var(--radius-md);
          transition: all 0.15s ease;
        }

        .btn-action-restore:hover:not(:disabled) {
          background: rgba(22, 163, 74, 0.18);
          border-color: var(--accent);
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }

        .confirm-modal-card {
          max-width: 440px;
          width: 100%;
          border-left: 4px solid var(--status-critical);
          padding: 22px 24px;
        }

        .modal-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .modal-title {
          font-size: 13px;
          font-weight: 700;
          color: var(--status-critical);
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }

        .btn-danger {
          background: var(--status-critical);
          color: #ffffff;
          border: none;
        }

        .btn-danger:hover {
          background: #b91c1c;
        }

        .btn-toggle-disable:hover:not(:disabled) {
          border-color: rgba(220, 38, 38, 0.4);
          color: var(--status-critical);
        }

        .btn-toggle-enable:hover:not(:disabled) {
          border-color: var(--accent-border);
          color: var(--status-healthy);
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .text-accent { color: var(--accent); }
        .text-warning { color: var(--status-warning, #f59e0b); }
        .text-critical { color: var(--status-critical); }
        .text-healthy { color: var(--status-healthy); }
        .text-info { color: var(--status-info, #38bdf8); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }

        @media (max-width: 1100px) {
          .users-summary-strip {
            grid-template-columns: repeat(2, 1fr);
          }
          .form-grid {
            grid-template-columns: 1fr;
          }
          .specs-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .users-summary-strip {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default UsersPage;
