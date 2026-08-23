import React, { useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { Activity, Lock, AlertOctagon, RefreshCw, Eye, EyeOff, Info } from 'lucide-react';

export function LoginPage() {
  const { isAuthenticated, login, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const targetPath = location.state?.from?.pathname || '/overview';

  if (isAuthenticated && !isAuthLoading) {
    return <Navigate to={targetPath} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await login(username.trim(), password);
      navigate(targetPath, { replace: true });
    } catch (err) {
      const status = err.response ? err.response.status : null;
      const detail = err.response?.data?.detail;

      if (status === 401) {
        setErrorMessage(detail || 'Invalid username or password.');
      } else if (status === 403) {
        setErrorMessage(detail || 'User account is disabled by Administrator.');
      } else if (status === 422) {
        setErrorMessage('Validation error: Invalid authentication payload.');
      } else if (status >= 500) {
        setErrorMessage(`Server error (HTTP ${status}): ${detail || 'Internal server error'}`);
      } else if (err.code === 'ECONNABORTED') {
        setErrorMessage('Authentication request timed out.');
      } else if (err.code === 'ERR_NETWORK') {
        setErrorMessage('Network connection failed. Verify API backend connectivity.');
      } else {
        setErrorMessage(detail || err.message || 'Authentication failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-gateway-page font-sans">
      <div className="neo-card login-card font-mono">
        {/* Brand Header */}
        <div className="login-brand font-sans">
          <div className="brand-logo-box">
            <Activity size={18} className="text-accent" />
          </div>
          <div>
            <span className="brand-title font-bold">SERVER INTELLIGENCE</span>
            <div className="brand-tag font-mono text-tertiary text-xs">v0.1.0-INDUSTRIAL</div>
          </div>
        </div>

        <div className="gateway-header-strip border-bottom padding-bottom-xs margin-top-md">
          <span className="editorial-tag">SECURITY GATEWAY</span>
          <h2 className="gateway-title font-sans font-bold">AUTHENTICATION GATEWAY</h2>
          <p className="gateway-subtitle font-sans text-xs text-secondary margin-top-xs">
            Restricted infrastructure telemetry console. Verified credentials required.
          </p>
        </div>

        {/* Redirect Notice */}
        {location.state?.from && (
          <div className="editorial-notice-banner notice-info margin-top-md">
            <Info size={14} className="shrink-0" />
            <span>Session authorization required for {location.state.from.pathname}.</span>
          </div>
        )}

        {/* Error Notice */}
        {errorMessage && (
          <div className="editorial-notice-banner notice-error margin-top-md">
            <AlertOctagon size={14} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="margin-top-md">
          <div className="field-group">
            <label htmlFor="username-input" className="field-label text-tertiary">
              USERNAME:
            </label>
            <input
              id="username-input"
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin"
              disabled={isSubmitting}
              className="neo-input login-input"
            />
          </div>

          <div className="field-group margin-top-md">
            <label htmlFor="password-input" className="field-label text-tertiary">
              PASSWORD:
            </label>
            <div className="password-wrapper">
              <input
                id="password-input"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isSubmitting}
                className="neo-input login-input input-pass"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="neo-icon-btn pass-toggle-btn"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>

          <div className="form-action margin-top-md">
            <button
              type="submit"
              disabled={isSubmitting || !username.trim() || !password.trim()}
              className="neo-btn neo-btn-primary btn-submit"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={13} className="spinning" />
                  <span>AUTHENTICATING...</span>
                </>
              ) : (
                <>
                  <Lock size={13} />
                  <span>AUTHENTICATE SESSION</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Technical Footer Badges */}
        <div className="login-card-footer border-top margin-top-lg padding-top-xs text-xs text-tertiary">
          <div className="badge-row">
            <span>AUTH: <strong className="text-primary">FASTAPI JWT BEARER</strong></span>
            <span className="sep">/</span>
            <span>SECURITY: <strong className="text-healthy">ENFORCED</strong></span>
          </div>
        </div>
      </div>

      <style>{`
        .margin-top-xs { margin-top: 4px; }
        .margin-top-md { margin-top: 16px; }
        .margin-top-lg { margin-top: 24px; }
        .padding-bottom-xs { padding-bottom: 8px; }
        .padding-top-xs { padding-top: 10px; }
        .border-bottom { border-bottom: 1px solid var(--border-subtle); }
        .border-top { border-top: 1px solid var(--border-subtle); }

        .login-gateway-page {
          min-height: 100vh;
          background-color: var(--bg-app);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .login-card {
          width: 100%;
          max-width: 420px;
          padding: 28px 32px;
          box-shadow: var(--shadow-raised-md);
        }

        .login-brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .brand-logo-box {
          width: 36px;
          height: 36px;
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .brand-title {
          font-size: 14px;
          letter-spacing: 0.04em;
          color: var(--text-primary);
        }

        .gateway-title {
          font-size: 18px;
          letter-spacing: -0.01em;
          color: var(--text-primary);
          margin-top: 2px;
        }

        .editorial-notice-banner {
          padding: 8px 12px;
          font-size: 11px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-radius: var(--radius-md);
        }

        .notice-info {
          background: rgba(2, 132, 199, 0.08);
          border: 1px solid rgba(2, 132, 199, 0.3);
          color: var(--status-info);
        }

        .notice-error {
          background: rgba(220, 38, 38, 0.1);
          border: 1px solid rgba(220, 38, 38, 0.3);
          color: var(--status-critical);
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .field-label {
          font-size: 10px;
          letter-spacing: 0.05em;
        }

        .login-input {
          width: 100%;
          text-align: left;
          font-size: 12px;
          height: 36px;
        }

        .password-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-pass {
          padding-right: 36px;
        }

        .pass-toggle-btn {
          position: absolute;
          right: 4px;
          width: 28px;
          height: 28px;
        }

        .btn-submit {
          width: 100%;
          height: 38px;
          justify-content: center;
          font-size: 11px;
        }

        .badge-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 10px;
        }

        .sep {
          color: var(--border-strong);
        }

        .shrink-0 { flex-shrink: 0; }
        .text-accent { color: var(--accent); }
        .text-healthy { color: var(--status-healthy); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }
      `}</style>
    </div>
  );
}

export default LoginPage;
