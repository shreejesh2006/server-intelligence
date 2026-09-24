import React, { useState, useEffect, useCallback } from 'react';
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
  User, 
  Crown,
  Terminal,
  Eye,
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
      setNotice(`Updated role for '${targetUsername}' to ${newRoleValue}.`);
      fetchUsers();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to update role.');
    } finally {
      setPendingUserId(null);
    }
  };

  const executeStatusToggle = async (targetUserId, targetUsername, currentStatus) => {
    if (targetUserId === currentUser?.id) {
      setNotice('Cannot disable your own active session.');
      return;
    }
    if (pendingUserId) return;

    setPendingUserId(targetUserId);
    setConfirmDisableTarget(null);

    const nextStatus = !currentStatus;
    try {
      await updateUserStatusApi(targetUserId, nextStatus);
      setNotice(`User '${targetUsername}' ${nextStatus ? 'enabled' : 'disabled'}.`);
      fetchUsers();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to update status.');
    } finally {
      setPendingUserId(null);
    }
  };

  const onRequestStatusToggle = (targetUser) => {
    if (targetUser.id === currentUser?.id) {
      setNotice('Cannot disable your own active session.');
      return;
    }

    if (targetUser.is_active) {
      setConfirmDisableTarget(targetUser);
    } else {
      executeStatusToggle(targetUser.id, targetUser.username, false);
    }
  };

  const adminCount = users.filter((u) => u.role === 'ADMIN').length;
  const operatorCount = users.filter((u) => u.role === 'OPERATOR').length;
  const viewerCount = users.filter((u) => u.role === 'VIEWER').length;

  return (
    <div className="users-page font-sans">
      {/* Main Page Header */}
      <div className="dashboard-main-header margin-bottom-md">
        <div>
          <h1 className="header-page-title font-sans">Users</h1>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="host-tab-btn active font-sans"
        >
          <UserPlus size={13} />
          <span>+ Add User</span>
        </button>
      </div>

      {/* Global Alerts */}
      {notice && (
        <div className="notice-banner notice-success font-sans margin-bottom-md">
          <CheckCircle2 size={14} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="notice-close">✕</button>
        </div>
      )}

      {error && (
        <div className="notice-banner notice-error font-sans margin-bottom-md">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="notice-close">✕</button>
        </div>
      )}

      {/* SUMMARY STATISTICAL TILES */}
      <div className="users-summary-grid margin-bottom-md font-sans">
        <div className="netra-panel stat-card">
          <div className="stat-top text-muted text-xs flex-center gap-xs font-sans">
            <User size={14} className="text-primary" />
            <span>Total Accounts</span>
          </div>
          <div className="stat-num font-bold text-primary font-sans margin-top-xs">
            {users.length}
          </div>
        </div>

        <div className="netra-panel stat-card">
          <div className="stat-top text-muted text-xs flex-center gap-xs font-sans">
            <Crown size={14} className="text-primary" />
            <span>Administrators</span>
          </div>
          <div className="stat-num font-bold text-primary font-sans margin-top-xs">
            {adminCount}
          </div>
        </div>

        <div className="netra-panel stat-card">
          <div className="stat-top text-muted text-xs flex-center gap-xs font-sans">
            <Terminal size={14} className="text-primary" />
            <span>Operators</span>
          </div>
          <div className="stat-num font-bold text-primary font-sans margin-top-xs">
            {operatorCount}
          </div>
        </div>

        <div className="netra-panel stat-card">
          <div className="stat-top text-muted text-xs flex-center gap-xs font-sans">
            <Eye size={14} className="text-primary" />
            <span>Viewers</span>
          </div>
          <div className="stat-num font-bold text-primary font-sans margin-top-xs">
            {viewerCount}
          </div>
        </div>
      </div>

      {/* Deactivation Confirmation Modal */}
      {confirmDisableTarget && (
        <div className="settings-modal-backdrop font-sans">
          <div className="settings-modal-container font-sans modal-narrow">
            <div className="modal-header border-bottom padding-bottom-xs flex-between">
              <div className="flex-center gap-xs">
                <ShieldAlert size={18} className="text-critical" />
                <h3 className="modal-title font-sans font-semibold text-primary">Confirm Deactivation</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setConfirmDisableTarget(null)}
                className="close-btn"
              >
                <X size={15} />
              </button>
            </div>
            <p className="font-sans text-xs text-secondary margin-top-sm margin-bottom-md">
              Disable account <strong>'{confirmDisableTarget.username}'</strong>? Session access will be revoked.
            </p>
            <div className="flex-end gap-xs border-top padding-top-sm">
              <button
                type="button"
                onClick={() => setConfirmDisableTarget(null)}
                className="host-tab-btn font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeStatusToggle(confirmDisableTarget.id, confirmDisableTarget.username, true)}
                className="host-tab-btn active font-sans text-critical"
              >
                Disable Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Creation Modal Popup */}
      {showCreateForm && (
        <div 
          className="settings-modal-backdrop font-sans"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateForm(false); }}
        >
          <div className="settings-modal-container font-sans modal-narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header border-bottom padding-bottom-xs flex-between">
              <div className="flex-center gap-xs">
                <div className="modal-icon-box">
                  <UserPlus size={16} className="text-primary" />
                </div>
                <h3 className="modal-title font-sans font-semibold text-primary">Add User</h3>
              </div>
              <button 
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="close-btn"
                title="Close"
              >
                <X size={15} />
              </button>
            </div>

            {createError && (
              <div className="notice-banner notice-error margin-top-sm font-sans">
                <AlertCircle size={13} />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="margin-top-md font-sans">
              <div className="form-fields-stack">
                <div className="field-box margin-bottom-md">
                  <label htmlFor="new-username" className="field-label text-muted font-sans text-xs margin-bottom-xs">
                    Username
                  </label>
                  <input
                    id="new-username"
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. john"
                    disabled={isCreating}
                    className="netra-input font-sans width-full"
                  />
                </div>

                <div className="field-box margin-bottom-md">
                  <label htmlFor="new-password" className="field-label text-muted font-sans text-xs margin-bottom-xs">
                    Password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={isCreating}
                    className="netra-input font-sans width-full"
                  />
                </div>

                <div className="field-box margin-bottom-md">
                  <label htmlFor="new-role" className="field-label text-muted font-sans text-xs margin-bottom-xs">Role</label>
                  <select
                    id="new-role"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    disabled={isCreating}
                    className="netra-metric-dropdown font-sans width-full"
                  >
                    <option value="VIEWER">Viewer</option>
                    <option value="OPERATOR">Operator</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer margin-top-lg padding-top-sm border-top flex-end gap-xs font-sans">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="host-tab-btn font-sans"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isCreating || !newUsername.trim() || !newPassword.trim()}
                  className="host-tab-btn active font-sans"
                >
                  {isCreating ? (
                    <>
                      <RefreshCw size={13} className="spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={13} />
                      <span>Add User</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users Registry Table Card */}
      <div className="netra-panel font-sans margin-bottom-lg">
        <div className="panel-title-bar border-bottom padding-bottom-xs flex-between">
          <h2 className="panel-title font-sans">User Accounts</h2>
        </div>

        {loading ? (
          <div className="font-sans padding-lg text-center text-muted text-xs">
            <RefreshCw size={16} className="spin margin-bottom-xs" />
            <p>Querying users...</p>
          </div>
        ) : (
          <div className="table-wrapper margin-top-xs font-sans">
            <table className="user-table font-sans">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;

                  return (
                    <tr key={u.id} className={!u.is_active ? 'user-disabled' : ''}>
                      <td>
                        <div className="user-name-cell font-sans">
                          <span className="font-medium text-primary">{u.username}</span>
                          {isSelf && <span className="self-tag font-sans">(You)</span>}
                        </div>
                      </td>
                      <td>
                        {isSelf ? (
                          <span className="font-medium text-primary font-sans">
                            {u.role === 'ADMIN' ? 'Admin' : u.role === 'OPERATOR' ? 'Operator' : 'Viewer'}
                          </span>
                        ) : (
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, u.username, e.target.value)}
                            disabled={pendingUserId === u.id}
                            className="netra-metric-dropdown font-sans"
                          >
                            <option value="ADMIN">Admin</option>
                            <option value="OPERATOR">Operator</option>
                            <option value="VIEWER">Viewer</option>
                          </select>
                        )}
                      </td>
                      <td>
                        <span className={`nokia-badge ${u.is_active ? 'badge-healthy' : 'badge-neutral'} font-sans`}>
                          <span className={`status-dot ${u.is_active ? 'dot-healthy' : 'dot-neutral'}`} />
                          {u.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="text-muted font-sans text-xs">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="text-right">
                        {!isSelf && (
                          <button
                            type="button"
                            onClick={() => onRequestStatusToggle(u)}
                            disabled={pendingUserId === u.id}
                            className={`host-tab-btn font-sans ${!u.is_active ? 'active' : ''}`}
                          >
                            {u.is_active ? 'Disable' : 'Enable'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .users-page {
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

        .users-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .stat-card {
          padding: 14px 16px;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        }

        .stat-num {
          font-size: 22px;
          line-height: 1.1;
        }

        .user-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .user-table th {
          text-align: left;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border-subtle);
        }

        .user-table td {
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-subtle);
          vertical-align: middle;
        }

        .user-table tr:last-child td {
          border-bottom: none;
        }

        .user-disabled td {
          opacity: 0.6;
        }

        .self-tag {
          font-size: 11px;
          color: var(--text-muted);
          margin-left: 6px;
        }

        .text-right { text-align: right; }
        .width-full { width: 100%; box-sizing: border-box; }
        .modal-narrow { max-width: 420px; }

        .settings-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(4px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fadeIn 0.15s ease-out;
        }

        .settings-modal-container {
          width: 100%;
          max-width: 440px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.2);
          border-radius: var(--radius-md);
          padding: 20px 24px;
          position: relative;
          max-height: 85vh;
          overflow-y: auto;
        }

        .modal-icon-box {
          width: 32px;
          height: 32px;
          background: var(--bg-canvas);
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal-title {
          font-size: 16px;
          letter-spacing: -0.01em;
        }

        .close-btn {
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          border-radius: var(--radius-xs);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .close-btn:hover {
          color: var(--text-primary);
          background: var(--bg-subtle);
        }

        .notice-banner {
          padding: 8px 12px;
          font-size: 12px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .notice-success {
          background: var(--status-healthy-bg);
          color: var(--status-healthy);
          border: 1px solid var(--border-subtle);
        }

        .notice-error {
          background: var(--status-critical-bg);
          color: var(--status-critical);
          border: 1px solid var(--border-subtle);
        }

        .notice-close {
          margin-left: auto;
          background: transparent;
          border: none;
          cursor: pointer;
          color: inherit;
        }

        .text-critical { color: var(--status-critical); }
        .margin-bottom-xs { margin-bottom: 6px; }
        .margin-bottom-md { margin-bottom: 16px; }
        .margin-bottom-lg { margin-bottom: 24px; }
        .margin-top-xs { margin-top: 6px; }
        .margin-top-md { margin-top: 16px; }
        .padding-bottom-xs { padding-bottom: 8px; }
        .padding-top-sm { padding-top: 12px; }
        .border-bottom { border-bottom: 1px solid var(--border-subtle); }
        .border-top { border-top: 1px solid var(--border-subtle); }

        .flex-between { display: flex; justify-content: space-between; align-items: center; }
        .flex-center { display: flex; align-items: center; }
        .flex-end { display: flex; justify-content: flex-end; }
        .gap-xs { gap: 8px; }

        .host-tab-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          font-family: var(--font-sans);
          font-size: 12px;
          padding: 4px 12px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .host-tab-btn:hover {
          background-color: var(--bg-surface-hover);
          color: var(--text-primary);
        }

        .host-tab-btn.active {
          background-color: var(--bg-surface);
          border-color: var(--border-strong);
          color: var(--text-primary);
          font-weight: 500;
        }

        .netra-input {
          background: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xs);
          color: var(--text-primary);
          font-size: 12px;
          padding: 6px 10px;
          outline: none;
        }

        .netra-metric-dropdown {
          background-color: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xs);
          color: var(--text-primary);
          font-size: 12px;
          padding: 4px 10px;
          outline: none;
          cursor: pointer;
          font-weight: 500;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

export default UsersPage;
