import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

export function OfflineBanner({ onRetry, error }) {
  return (
    <div className="offline-banner font-mono">
      <div className="banner-content">
        <WifiOff size={16} className="banner-icon" />
        <div>
          <div className="banner-title">TELEMETRY OFFLINE</div>
          <div className="banner-desc">
            Unable to establish connection with Server Intelligence API at{' '}
            <code>{import.meta.env.VITE_API_BASE_URL || 'http://192.168.64.22:8000'}</code>
            {error ? ` (${error})` : ''}.
          </div>
        </div>
      </div>
      <button type="button" onClick={onRetry} className="editorial-btn">
        <RefreshCw size={12} /> RETRY CONNECTION
      </button>

      <style>{`
        .offline-banner {
          background-color: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-left: 4px solid var(--status-critical);
          padding: 16px 20px;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .banner-content {
          display: flex;
          align-items: flex-start;
          gap: 14px;
        }

        .banner-icon {
          color: var(--status-critical);
          margin-top: 2px;
        }

        .banner-title {
          font-weight: 700;
          font-size: 12px;
          color: var(--status-critical);
          letter-spacing: 0.05em;
        }

        .banner-desc {
          font-size: 11px;
          color: var(--text-secondary);
          margin-top: 2px;
        }

        .banner-desc code {
          color: var(--text-primary);
          background: rgba(255,255,255,0.05);
          padding: 1px 4px;
        }
      `}</style>
    </div>
  );
}

export default OfflineBanner;
