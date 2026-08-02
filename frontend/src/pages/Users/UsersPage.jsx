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
  Users, 
  UserPlus, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Shield, 
  UserCheck, 
  UserX 
} from 'lucide-react';
import { formatUtcTime } from '../../utils/formatters';

export function UsersPage() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Create User Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('VIEWER');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Fetch users from /api/users
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUsersApi();
      setUsers(data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Handle user creation
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

      setNotice(`User '${createdUser.username}' created successfully.`);
      setNewUsername('');
      setNewPassword('');
      setNewRole('VIEWER');
      setShowCreateForm(false);
      fetchUsers();
    } catch (err) {
      setCreateError(err?.response?.data?.detail || 'Failed to create user.');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle role update
  const handleRoleChange = async (targetUserId, targetUsername, newRoleValue) => {
    if (targetUserId === currentUser?.id) {
      setNotice('Cannot change your own administrative role.');
      return;
    }

    try {
      await updateUserRoleApi(targetUserId, newRoleValue);
      setNotice(`Updated role for '${targetUsername}' to ${newRoleValue}.`);
      fetchUsers();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to update role.');
    }
  };

  // Handle status toggle (Enable/Disable)
  const handleStatusToggle = async (targetUserId, targetUsername, currentStatus) => {
    if (targetUserId === currentUser?.id) {
      setNotice('Cannot disable your own administrative account.');
      return;
    }

    const nextStatus = !currentStatus;
    try {
      await updateUserStatusApi(targetUserId, nextStatus);
      setNotice(`User '${targetUsername}' ${nextStatus ? 'enabled' : 'disabled'}.`);
      fetchUsers();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to update status.');
    }
  };

  return (
    <div className="users-page font-mono">
      <PageHeader
        index="07"
        title="USER & ACCESS CONTROL"
        subtitle="Role-Based Access Control (RBAC) user administration registry."
        tag="SECURITY & ACCESS"
      >
        <button
          type="button"
          onClick={() => setShowCreateForm((prev) => !prev)}
          className="editorial-btn"
        >
          <UserPlus size={13} />
          <span>{showCreateForm ? 'CLOSE CREATION FORM' : '+ CREATE USER'}</span>
        </button>
      </PageHeader>

      {/* Global Alerts & Notices */}
      {notice && (
        <div className="editorial-notice-banner notice-success">
          <CheckCircle2 size={15} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="notice-close">✕</button>
        </div>
      )}

      {error && (
        <div className="editorial-notice-banner notice-error">
          <AlertCircle size={15} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="notice-close">✕</button>
        </div>
      )}

      {/* Create User Form Section */}
      {showCreateForm && (
        <section className="create-user-section font-mono">
          <div className="section-header">
            <span className="editorial-tag font-bold">USER REGISTRATION FORM</span>
            <span className="editorial-pill pill-neutral font-mono">ADMIN PRIVILEGE</span>
          </div>

          {createError && (
            <div className="editorial-notice-banner notice-error mb-4">
              <AlertCircle size={14} />
              <span>{createError}</span>
            </div>
          )}

          <form onSubmit={handleCreateUser} className="create-user-form">
            <div className="form-grid">
              <div className="form-field">
                <label className="field-label">USERNAME (MIN 3 CHARS):</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. operator_john"
                  className="editorial-input field-input"
                />
              </div>

              <div className="form-field">
                <label className="field-label">PASSWORD (MIN 8 CHARS):</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="editorial-input field-input"
                />
              </div>

              <div className="form-field">
                <label className="field-label">ASSIGNED ROLE:</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="editorial-select field-select"
                >
                  <option value="VIEWER">VIEWER (Read-Only)</option>
                  <option value="OPERATOR">OPERATOR (Alert Management)</option>
                  <option value="ADMIN">ADMIN (Full Control)</option>
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                disabled={isCreating || !newUsername.trim() || !newPassword.trim()}
                className="editorial-btn btn-submit"
              >
                {isCreating ? (
                  <>
                    <RefreshCw size={12} className="spinning" />
                    <span>CREATING USER...</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={12} />
                    <span>REGISTER USER IDENTIFIER</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Users Registry Table */}
      <section className="user-registry-section">
        <div className="section-top">
          <div>
            <span className="editorial-tag font-bold">AUTHENTICATED USER REGISTRY</span>
            <p className="editorial-subtitle font-sans text-xs text-secondary mt-1">
              Active user accounts provisioned in SQLite / FastAPI authentication database.
            </p>
          </div>
          <div className="section-actions">
            <span className="editorial-pill pill-neutral">
              {users.length} REGISTERED {users.length === 1 ? 'ACCOUNT' : 'ACCOUNTS'}
            </span>
            <button
              type="button"
              onClick={fetchUsers}
              className={`icon-btn ${loading ? 'spinning' : ''}`}
              title="Refresh users list"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="users-loading-state font-mono">
            <RefreshCw size={16} className="spinning text-accent" />
            <span>FETCHING USER REGISTRY FROM BACKEND...</span>
          </div>
        ) : (
          <table className="editorial-table font-mono">
            <thead>
              <tr>
                <th>ID</th>
                <th>USERNAME</th>
                <th>ROLE ASSIGNMENT</th>
                <th>ACCOUNT STATUS</th>
                <th>CREATED AT</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                const formattedDate = u.created_at
                  ? new Date(u.created_at).toISOString().replace('T', ' ').substring(0, 16) + ' UTC'
                  : 'N/A';

                return (
                  <tr key={u.id} className={isSelf ? 'row-self' : ''}>
                    <td className="font-mono text-tertiary">#{u.id}</td>
                    <td>
                      <div className="username-cell">
                        <span className="username-text">{u.username}</span>
                        {isSelf && <span className="editorial-pill pill-healthy self-tag">YOU (ACTIVE SESSION)</span>}
                      </div>
                    </td>
                    <td>
                      <select
                        value={u.role}
                        disabled={isSelf}
                        onChange={(e) => handleRoleChange(u.id, u.username, e.target.value)}
                        className="editorial-select role-select"
                        title={isSelf ? 'Cannot change your own role' : 'Change user role'}
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
                    <td className="text-secondary text-xs">{formattedDate}</td>
                    <td>
                      <button
                        type="button"
                        disabled={isSelf}
                        onClick={() => handleStatusToggle(u.id, u.username, u.is_active)}
                        className={`editorial-btn text-xs ${u.is_active ? 'btn-disable' : 'btn-enable'}`}
                        title={isSelf ? 'Cannot disable your own account' : u.is_active ? 'Disable account' : 'Enable account'}
                      >
                        {u.is_active ? 'DISABLE' : 'ENABLE'}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {users.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center py-6 text-tertiary">
                    NO USER ACCOUNTS RETURNED FROM BACKEND
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      <style>{`
        .users-page {
          display: flex;
          flex-direction: column;
        }

        .editorial-notice-banner {
          padding: 10px 16px;
          font-size: 11px;
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 20px;
        }

        .notice-success {
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-left: 3px solid var(--status-healthy);
          color: var(--status-healthy);
        }

        .notice-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-left: 3px solid var(--status-critical);
          color: var(--status-critical);
        }

        .notice-close {
          margin-left: auto;
          background: transparent;
          border: none;
          color: inherit;
          cursor: pointer;
        }

        .create-user-section {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 24px;
          margin-bottom: 28px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 20px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
          margin-bottom: 20px;
        }

        .form-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field-label {
          font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.08em;
        }

        .field-input, .field-select {
          width: 100%;
          text-align: left;
          padding: 8px 12px;
          font-size: 11px;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
        }

        .btn-submit {
          padding: 10px 20px;
        }

        .user-registry-section {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 24px;
        }

        .section-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 16px;
        }

        .section-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .users-loading-state {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 40px 0;
          color: var(--text-tertiary);
          font-size: 11px;
        }

        .username-cell {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .username-text {
          font-weight: 600;
          color: var(--text-primary);
        }

        .self-tag {
          font-size: 9px;
        }

        .role-select {
          padding: 4px 8px;
          font-size: 10px;
        }

        .row-self {
          background-color: var(--accent-muted);
        }

        .btn-disable:hover:not(:disabled) {
          border-color: var(--status-critical);
          color: var(--status-critical);
        }

        .btn-enable:hover:not(:disabled) {
          border-color: var(--status-healthy);
          color: var(--status-healthy);
        }

        .text-center { text-align: center; }
        .py-6 { padding-top: 24px; padding-bottom: 24px; }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-xs { font-size: 11px; }
        .mb-4 { margin-bottom: 16px; }

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

export default UsersPage;
