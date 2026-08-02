import React from 'react';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import { Users, Lock, ShieldCheck } from 'lucide-react';

export function UsersPage() {
  return (
    <div className="users-page font-mono">
      <PageHeader
        index="07"
        title="USER & ACCESS CONTROL"
        subtitle="Role-Based Access Control (RBAC) and user management surface."
        tag="SECURITY & ACCESS"
      />

      <EmptyState
        title="AUTHENTICATION SYSTEM PENDING"
        subtitle="The authentication subsystem and JWT/OAuth RBAC service are currently unconfigured."
        statusTag="AUTH SUBSYSTEM PENDING"
        icon={Users}
        technicalNotes={[
          'Role Hierarchy: ADMIN (Full Control), OPERATOR (Acknowledge & Mute Alerts), VIEWER (Read-only Telemetry)',
          'Security Mechanisms: JWT Bearer Tokens, GeoLock IP restrictions, Multi-Factor Authentication (MFA)',
          'Session Timeout: 15-minute inactivity session expiration',
          'Audit Logging: Immutable action log for all user configuration edits',
        ]}
      />

      {/* Surface Preview Table */}
      <section className="user-surface-section">
        <div className="surface-header">
          <div>
            <span className="editorial-tag font-bold">USER REGISTRY SURFACE PREVIEW</span>
            <p className="editorial-subtitle font-sans text-xs text-secondary mt-1">
              Structure for RBAC identity management.
            </p>
          </div>
          <button type="button" disabled className="editorial-btn">
            + CREATE USER (DISABLED)
          </button>
        </div>

        <table className="editorial-table">
          <thead>
            <tr>
              <th>USER IDENTITY</th>
              <th>ASSIGNED ROLE</th>
              <th>STATUS</th>
              <th>GEOLOCK STATUS</th>
              <th>LAST LOGIN</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>operator@server-intelligence.local</td>
              <td><span className="editorial-pill pill-neutral">OPERATOR</span></td>
              <td><span className="text-healthy">ACTIVE</span></td>
              <td>ENFORCED (ALLOWED)</td>
              <td>SYSTEM SESSION</td>
              <td><button type="button" disabled className="editorial-btn text-xs">EDIT</button></td>
            </tr>
          </tbody>
        </table>
      </section>

      <style>{`
        .user-surface-section {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 24px;
          margin-top: 24px;
        }

        .surface-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 16px;
        }

        .text-healthy { color: var(--status-healthy); }
      `}</style>
    </div>
  );
}

export default UsersPage;
