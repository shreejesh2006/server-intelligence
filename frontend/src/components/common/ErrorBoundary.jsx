import React, { Component } from 'react';
import PageHeader from './PageHeader';
import { RefreshCw, ShieldAlert } from 'lucide-react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (import.meta.env.DEV || process.env.NODE_ENV !== 'production') {
      console.error('[ErrorBoundary caught exception]', error, errorInfo);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-screen font-mono">
          <div className="error-boundary-container">
            <PageHeader
              index="500"
              title="SYSTEM RECOVERY GATEWAY"
              subtitle="An unhandled rendering exception occurred inside the active application surface."
              tag="SYSTEM RECOVERY"
            />

            <div className="error-card">
              <div className="card-header">
                <ShieldAlert size={24} className="text-critical" />
                <div>
                  <h3 className="card-title font-sans">UNHANDLED RUNTIME EXCEPTION</h3>
                  <p className="card-subtitle font-sans">
                    The rendering engine encountered an isolated fault. Application state was safely halted.
                  </p>
                </div>
              </div>

              <div className="editorial-rule" />

              <div className="error-spec-box font-mono">
                <div className="spec-row">
                  <span className="spec-label">FAULT ISOLATION:</span>
                  <span className="spec-val">REACT COMPONENT SUBSYSTEM</span>
                </div>
                <div className="spec-row">
                  <span className="spec-label">RECOVERY METHOD:</span>
                  <span className="spec-val">SAFE APPLICATION STATE RELOAD</span>
                </div>
              </div>

              <div className="card-actions">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="editorial-btn btn-reload"
                >
                  <RefreshCw size={12} />
                  <span>RELOAD APPLICATION SURFACE</span>
                </button>
              </div>
            </div>
          </div>

          <style>{`
            .error-boundary-screen {
              min-height: 100vh;
              background-color: var(--bg-main);
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 24px;
            }

            .error-boundary-container {
              width: 100%;
              max-width: 600px;
            }

            .error-card {
              background: var(--bg-surface);
              border: 1px solid var(--border-strong);
              border-left: 4px solid var(--status-critical);
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
              color: var(--status-critical);
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

            .error-spec-box {
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
              width: 150px;
            }

            .spec-val {
              color: var(--text-primary);
              font-weight: 500;
            }

            .card-actions {
              display: flex;
            }

            .btn-reload {
              padding: 10px 20px;
            }

            .text-critical {
              color: var(--status-critical);
            }
          `}</style>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
