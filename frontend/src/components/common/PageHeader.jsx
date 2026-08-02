import React from 'react';

export function PageHeader({ index, title, subtitle, tag = 'SYSTEM OBSERVABILITY', children }) {
  return (
    <div className="page-header-module">
      <div className="page-header-top">
        <div className="header-index-group">
          <span className="editorial-number font-mono text-sm">{index}</span>
          <span className="header-slash">/</span>
          <span className="editorial-tag">{tag}</span>
        </div>
      </div>
      <div className="page-header-main">
        <div>
          <h1 className="page-header-title">{title}</h1>
          {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
        </div>
        {children && <div className="page-header-actions">{children}</div>}
      </div>
      <div className="editorial-rule-header" />

      <style>{`
        .page-header-module {
          margin-bottom: 28px;
        }

        .page-header-top {
          margin-bottom: 8px;
        }

        .header-index-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .header-slash {
          color: var(--border-strong);
          font-family: var(--font-mono);
        }

        .page-header-main {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 24px;
          flex-wrap: wrap;
        }

        .page-header-title {
          font-size: 26px;
          font-weight: 700;
          letter-spacing: -0.02em;
          text-transform: uppercase;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .page-header-subtitle {
          font-size: 13px;
          color: var(--text-secondary);
          margin-top: 6px;
        }

        .page-header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .editorial-rule-header {
          height: 1px;
          background: linear-gradient(90deg, var(--border-strong) 0%, var(--border-subtle) 100%);
          margin-top: 16px;
        }
      `}</style>
    </div>
  );
}

export default PageHeader;
