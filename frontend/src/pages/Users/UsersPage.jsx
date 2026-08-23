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
  UserCheck, 
  UserX
} from 'lucide-react';

export function UsersPage() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Create User Form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('VIEWER');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Confirmation Modal
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
      setCreateError(err?.response?.data?.detail || 'Failed to register user.');
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

  return (
    <div className="users-page font-sans">
      <PageHeader
        index="07"
        title="USER & ACCESS CONTROL"
        subtitle="Role-Based Access Control (RBAC) administrative account management."
        tag="SECURITY REGISTRY"
      >
        <button
          type="button"
          onClick={() => setShowCreateForm((prev) => !prev)}
          className={`neo-btn ${showCreateForm ? 'neo-btn-active' : 'neo-btn-primary'}`}
        >
          <UserPlus size={13} />
          <span>{showCreateForm ? 'CLOSE REGISTRATION' : '+ PROVISION USER'}</span>
        </button>
      </PageHeader>

      {/* Global Alerts */}
      {notice && (
        <div className="editorial-notice-banner notice-success font-mono margin-bottom-md">
          <CheckCircle2 size={14} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="notice-close">✕</button>
        </div>
      )}

      {error && (
        <div className="editorial-notice-banner notice-error font-mono margin-bottom-md">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="notice-close">✕</button>
        </div>
      )}

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

      {/* User Creation Form */}
      {showCreateForm && (
        <section className="neo-card neo-card-raised form-section font-mono margin-bottom-lg">
          <div className="form-header border-bottom padding-bottom-xs">
            <div className="title-box">
              <UserPlus size={16} className="text-accent" />
              <span className="editorial-tag">PROVISION NEW USER ACCOUNT</span>
            </div>
            <span className="editorial-pill pill-neutral">ADMINISTRATIVE ACTION</span>
          </div>

          {createError && (
            <div className="editorial-notice-banner notice-error margin-top-sm">
              <AlertCircle size={13} />
              <span>{createError}</span>
            </div>
          )}

          <form onSubmit={handleCreateUser} className="margin-top-md">
            <div className="form-grid">
              <div className="field-box">
                <label htmlFor="new-username" className="field-label text-tertiary">USERNAME (MIN 3 CHARS):</label>
                <input
                  id="new-username"
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. operator_john"
                  disabled={isCreating}
                  className="neo-input"
                />
              </div>

              <div className="field-box">
                <label htmlFor="new-password" className="field-label text-tertiary">PASSWORD (MIN 8 CHARS):</label>
                <input
                  id="new-password"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isCreating}
                  className="neo-input"
                />
              </div>

              <div className="field-box">
                <label htmlFor="new-role" className="field-label text-tertiary">ROLE ASSIGNMENT:</label>
                <select
                  id="new-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  disabled={isCreating}
                  className="neo-select"
                >
                  <option value="VIEWER">VIEWER (Read-Only Telemetry)</option>
                  <option value="OPERATOR">OPERATOR (Alert & Node Control)</option>
                  <option value="ADMIN">ADMIN (Full Administrative Control)</option>
                </select>
              </div>
            </div>

            <div className="form-footer margin-top-md">
              <button
                type="submit"
                disabled={isCreating || !newUsername.trim() || !newPassword.trim()}
                className="neo-btn neo-btn-primary"
              >
                {isCreating ? (
                  <>
                    <RefreshCw size={12} className="spinning" />
                    <span>PROVISIONING...</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={12} />
                    <span>REGISTER ACCOUNT</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Users Registry Table Card */}
      <section className="neo-card registry-card font-mono">
        <div className="registry-header border-bottom padding-bottom-xs">
          <div>
            <span className="editorial-tag">AUTHENTICATED USERS REGISTRY</span>
            <p className="editorial-subtitle font-sans text-xs text-secondary margin-top-xs">
              Provisioned user accounts and Role-Based Access Control privileges.
            </p>
          </div>
          <div className="header-actions">
            <span className="editorial-pill pill-neutral">
              {users.length} REGISTERED {users.length === 1 ? 'ACCOUNT' : 'ACCOUNTS'}
            </span>
            <button
              type="button"
              onClick={fetchUsers}
              className={`neo-icon-btn ${loading ? 'spinning' : ''}`}
              title="Refresh users"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="users-loading-state font-mono">
            <RefreshCw size={14} className="spinning text-accent" />
            <span>FETCHING USER ACCOUNTS...</span>
          </div>
        ) : (
          <div className="table-wrapper margin-top-md">
            <table className="user-table font-mono">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>USERNAME</th>
                  <th>ROLE ASSIGNMENT</th>
                  <th>STATUS</th>
                  <th>CREATED AT</th>
                  <th>ACTION</th>
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
                      <td className="text-tertiary">#{u.id}</td>
                      <td>
                        <div className="user-name-cell font-sans">
                          <span className="user-name font-bold">{u.username}</span>
                          {isSelf && <span className="editorial-pill pill-healthy self-tag">YOU (ACTIVE SESSION)</span>}
                        </div>
                      </td>
                      <td>
                        <select
                          value={u.role}
                          disabled={isSelf || isPending}
                          onChange={(e) => handleRoleChange(u.id, u.username, e.target.value)}
                          className="neo-select select-role"
                          aria-label={`Role for user ${u.username}`}
                        >
                          <option value="ADMIN">ADMIN</option>
                          <option value="OPERATOR">OPERATOR</option>
                          <option value="VIEWER">VIEWER</option>
                        </select>
                      </td>
                      <td>
                        {u.is_active ? (
                          <span className="editorial-pill pill-healthy">
                            <UserCheck size={11} /> ACTIVE
                          </span>
                        ) : (
                          <span className="editorial-pill pill-critical">
                            <UserX size={11} /> DISABLED
                          </span>
                        )}
                      </td>
                      <td className="text-tertiary text-xs">{formattedDate}</td>
                      <td>
                        <button
                          type="button"
                          disabled={isSelf || isPending}
                          onClick={() => onRequestStatusToggle(u)}
                          className={`neo-btn text-xs ${u.is_active ? 'btn-toggle-disable' : 'btn-toggle-enable'}`}
                        >
                          {isPending ? (
                            <RefreshCw size={11} className="spinning" />
                          ) : u.is_active ? (
                            'DISABLE'
                          ) : (
                            'ENABLE'
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {users.length === 0 && (
                  <tr>
                    <td colSpan="6" className="empty-row text-tertiary">
                      NO USER ACCOUNTS REGISTERED
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style>{`
        .margin-top-xs { margin-top: 4px; }
        .margin-top-sm { margin-top: 8px; }
        .margin-top-md { margin-top: 16px; }
        .margin-bottom-md { margin-bottom: 16px; }
        .margin-bottom-lg { margin-bottom: 24px; }
        .padding-bottom-xs { padding-bottom: 8px; }
        .border-bottom { border-bottom: 1px solid var(--border-subtle); }

        .editorial-notice-banner {
          padding: 8px 14px;
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
          background: rgba(15, 23, 42, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 20px;
        }

        .confirm-modal-card {
          max-width: 440px;
          width: 100%;
          border-left: 3px solid var(--status-critical);
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

        .form-section {
          padding: 20px 24px;
        }

        .form-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .title-box {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
        }

        .field-box {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .field-label {
          font-size: 10px;
          letter-spacing: 0.05em;
        }

        .form-footer {
          display: flex;
          justify-content: flex-end;
        }

        .registry-card {
          padding: 20px 24px;
        }

        .registry-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .users-loading-state {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 36px 0;
          color: var(--text-tertiary);
          font-size: 11px;
        }

        .table-wrapper {
          overflow-x: auto;
        }

        .user-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          text-align: left;
        }

        .user-table th {
          font-size: 10px;
          letter-spacing: 0.08em;
          color: var(--text-tertiary);
          border-bottom: 1px solid var(--border-strong);
          padding: 8px 12px;
        }

        .user-table td {
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-subtle);
          color: var(--text-primary);
          vertical-align: middle;
        }

        .row-self {
          background-color: var(--accent-muted);
        }

        .user-name-cell {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .user-name {
          font-size: 12px;
        }

        .self-tag {
          font-size: 9px;
        }

        .select-role {
          height: 28px;
          font-size: 10px;
          padding: 2px 6px;
        }

        .btn-toggle-disable:hover:not(:disabled) {
          border-color: rgba(220, 38, 38, 0.4);
          color: var(--status-critical);
        }

        .btn-toggle-enable:hover:not(:disabled) {
          border-color: var(--accent-border);
          color: var(--status-healthy);
        }

        .empty-row {
          text-align: center;
          padding: 24px 0;
        }

        .text-accent { color: var(--accent); }
        .text-critical { color: var(--status-critical); }
        .text-healthy { color: var(--status-healthy); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }
      `}</style>
    </div>
  );
}

export default UsersPage;
