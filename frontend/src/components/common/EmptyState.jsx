import React from 'react';
import { Cpu, Terminal, ShieldAlert, Sparkles } from 'lucide-react';

export function EmptyState({
  title = 'CAPABILITY MODULE PENDING',
  subtitle = 'Backend model pipeline connection required.',
  statusTag = 'PIPELINE UNCONNECTED',
  icon: Icon = Cpu,
  technicalNotes = [],
}) {
  return (
    <div className="empty-state-card font-mono">
      <div className="empty-state-header">
        <div className="empty-state-tag">
          <span className="editorial-tag">{statusTag}</span>
        </div>
        <span className="editorial-pill pill-neutral">FUTURE STATE</span>
      </div>

      <div className="empty-state-body">
        <div className="empty-state-icon-wrap">
          <Icon size={24} className="empty-state-icon" />
        </div>

        <h3 className="empty-state-title">{title}</h3>
        <p className="empty-state-subtitle">{subtitle}</p>

        {technicalNotes && technicalNotes.length > 0 && (
          <div className="technical-spec-box">
            <div className="spec-box-title">TECHNICAL ARCHITECTURE SPECIFICATION:</div>
            <ul className="spec-list">
              {technicalNotes.map((note, idx) => (
                <li key={idx}>
                  <span className="spec-bullet">├─</span> {note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <style>{`
        .empty-state-card {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-strong);
          padding: 36px 40px;
          margin: 24px 0;
        }

        .empty-state-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 16px;
          margin-bottom: 28px;
        }

        .empty-state-body {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          max-width: 800px;
        }

        .empty-state-icon-wrap {
          width: 48px;
          height: 48px;
          background: var(--bg-main);
          border: 1px solid var(--border-strong);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          color: var(--accent);
        }

        .empty-state-title {
          font-size: 16px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--text-primary);
          margin-bottom: 8px;
        }

        .empty-state-subtitle {
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.6;
          margin-bottom: 24px;
        }

        .technical-spec-box {
          width: 100%;
          background: var(--bg-main);
          border: 1px solid var(--border-subtle);
          padding: 16px 20px;
        }

        .spec-box-title {
          font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.1em;
          margin-bottom: 10px;
        }

        .spec-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 11px;
          color: var(--text-secondary);
        }

        .spec-bullet {
          color: var(--accent);
          margin-right: 6px;
        }
      `}</style>
    </div>
  );
}

export default EmptyState;
