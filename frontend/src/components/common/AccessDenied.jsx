import React from 'react';
import PageHeader from './PageHeader';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { NavLink } from 'react-router';

export function AccessDenied({ requiredRole = 'ADMIN' }) {
  return (
    <div className="access-denied-container font-mono">
      <PageHeader
        index="403"
        title="ACCESS RESTRICTED"
        subtitle="Insufficient Role-Based Access Control (RBAC) privileges."
        tag="SECURITY GATEWAY"
      />

      <div className="access-denied-card">
        <div className="card-header">
          <ShieldAlert size={24} className="text-critical" />
          <div>
            <h3 className="card-title">403 FORBIDDEN — PRIVILEGE ELEVATION REQUIRED</h3>
            <p className="card-subtitle font-sans">
              Your current account role does not possess permissions to access this surface.
            </p>
          </div>
        </div>

        <div className="editorial-rule-subtle" />

        <div className="access-spec-box">
          <div className="spec-row">
            <span className="spec-label">REQUIRED PRIVILEGE:</span>
            <span className="editorial-pill pill-critical">{requiredRole}</span>
          </div>
          <div className="spec-row">
            <span className="spec-label">ACTION STATUS:</span>
            <span className="spec-val">DENIED BY FRONTEND ROLE GUARD</span>
          </div>
        </div>

        <div className="card-actions">
          <NavLink to="/overview" className="editorial-btn">
            <ArrowLeft size={12} /> RETURN TO OVERVIEW
          </NavLink>
        </div>
      </div>

      <style>{`
        .access-denied-container {
          padding: 20px 0;
        }

        .access-denied-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          border-left: 4px solid var(--status-critical);
          padding: 32px;
          margin-top: 24px;
        }

        .card-header {
          display: flex;
          align-items: flex-start;
          gap: 16px;
        }

        .card-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--status-critical);
          letter-spacing: 0.05em;
        }

        .card-subtitle {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 4px;
        }

        .editorial-rule-subtle {
          height: 1px;
          background: var(--border-subtle);
          margin: 20px 0;
        }

        .access-spec-box {
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 24px;
          font-size: 11px;
        }

        .spec-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .spec-label {
          color: var(--text-tertiary);
          width: 140px;
        }

        .spec-val {
          color: var(--text-primary);
          font-weight: 500;
        }

        .card-actions {
          display: flex;
          gap: 12px;
        }

        .text-critical {
          color: var(--status-critical);
        }
      `}</style>
    </div>
  );
}

export default AccessDenied;
