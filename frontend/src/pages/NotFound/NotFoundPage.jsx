import React from 'react';
import PageHeader from '../../components/common/PageHeader';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { NavLink } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="not-found-page font-mono">
      <PageHeader
        index="404"
        title="SURFACE NOT FOUND"
        subtitle="The requested URL route index does not exist in the navigation hierarchy."
        tag="NAVIGATION GATEWAY"
      />

      <div className="not-found-card">
        <div className="card-header">
          <FileQuestion size={24} className="text-accent" />
          <div>
            <h3 className="card-title font-sans">HTTP 404 — UNKNOWN ROUTE INDEX</h3>
            <p className="card-subtitle font-sans">
              No registered surface or API endpoint corresponds to the current address path.
            </p>
          </div>
        </div>

        <div className="editorial-rule" />

        <div className="not-found-spec font-mono">
          <div className="spec-row">
            <span className="spec-label">STATUS CODE:</span>
            <span className="spec-val">404 NOT FOUND</span>
          </div>
          <div className="spec-row">
            <span className="spec-label">ACTION:</span>
            <span className="spec-val">RETURN TO SYSTEM OVERVIEW</span>
          </div>
        </div>

        <div className="card-actions">
          <NavLink to="/overview" className="editorial-btn">
            <ArrowLeft size={12} />
            <span>RETURN TO OVERVIEW</span>
          </NavLink>
        </div>
      </div>

      <style>{`
        .not-found-page {
          padding: 10px 0;
        }

        .not-found-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          border-left: 4px solid var(--accent);
          padding: 28px 32px;
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
          color: var(--text-primary);
          letter-spacing: 0.05em;
        }

        .card-subtitle {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 4px;
        }

        .editorial-rule {
          height: 1px;
          background: var(--border-subtle);
          margin: 20px 0;
        }

        .not-found-spec {
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
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
        }

        .text-accent {
          color: var(--accent);
        }
      `}</style>
    </div>
  );
}

export default NotFoundPage;
