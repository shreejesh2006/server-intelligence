import React from 'react';

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="nokia-page-header font-sans">
      <div className="header-body">
        <div>
          <h1 className="header-title">{title}</h1>
          {subtitle && <p className="header-subtitle">{subtitle}</p>}
        </div>
        {children && <div className="header-actions">{children}</div>}
      </div>

      <style>{`
        .nokia-page-header {
          margin-bottom: 24px;
        }

        .header-body {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .header-title {
          font-size: 20px;
          font-weight: 600;
          letter-spacing: -0.015em;
          color: var(--text-primary);
          line-height: 1.3;
        }

        .header-subtitle {
          font-size: 13px;
          color: var(--text-secondary);
          margin-top: 2px;
          font-weight: 400;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
      `}</style>
    </div>
  );
}

export default PageHeader;
