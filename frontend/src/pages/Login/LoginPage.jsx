import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { Activity, Lock, AlertOctagon, RefreshCw } from 'lucide-react';

export function LoginPage() {
  const { isAuthenticated, login, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // If already authenticated, redirect to /overview
  if (isAuthenticated && !isAuthLoading) {
    return <Navigate to="/overview" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await login(username.trim(), password);
      navigate('/overview', { replace: true });
    } catch (err) {
      if (!err.response) {
        setErrorMessage('Unable to reach Server Intelligence API server. Check backend connection.');
      } else if (err.response.status === 401) {
        setErrorMessage('Invalid username or password.');
      } else if (err.response.status === 403) {
        setErrorMessage('User account is disabled by Administrator.');
      } else {
        setErrorMessage(err.response.data?.detail || 'Authentication failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-gateway-page font-mono">
      <div className="login-container">
        {/* Brand & Editorial Header */}
        <div className="login-header">
          <div className="login-brand">
            <Activity className="brand-icon" size={20} />
            <span className="brand-name font-sans">SERVER INTELLIGENCE</span>
            <span className="editorial-pill pill-neutral">v0.1.0</span>
          </div>

          <div className="gateway-title-box">
            <span className="editorial-tag">SECURITY GATEWAY / INDEX 00</span>
            <h1 className="gateway-title font-sans">AUTHENTICATION GATEWAY</h1>
            <p className="gateway-subtitle font-sans">
              Restricted infrastructure monitoring environment. Valid credentials required.
            </p>
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="login-error-banner font-mono">
            <AlertOctagon size={16} className="text-critical shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Authentication Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username-input" className="form-label">
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
              className="editorial-input login-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password-input" className="form-label">
              PASSWORD:
            </label>
            <input
              id="password-input"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isSubmitting}
              className="editorial-input login-input"
            />
          </div>

          <div className="form-action">
            <button
              type="submit"
              disabled={isSubmitting || !username.trim() || !password.trim()}
              className="editorial-btn login-submit-btn"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={12} className="spinning" />
                  <span>AUTHENTICATING...</span>
                </>
              ) : (
                <>
                  <Lock size={12} />
                  <span>AUTHENTICATE</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Technical Footer */}
        <div className="login-footer">
          <span className="footer-label">AUTH METHOD:</span>
          <span className="footer-val">FASTAPI JWT BEARER</span>
          <span className="footer-sep">/</span>
          <span className="footer-label">SECURITY:</span>
          <span className="footer-val">ENFORCED</span>
        </div>
      </div>

      <style>{`
        .login-gateway-page {
          min-height: 100vh;
          background-color: var(--bg-main);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .login-container {
          background-color: var(--bg-surface);
          border: 1px solid var(--border-strong);
          width: 100%;
          max-width: 440px;
          padding: 36px 40px;
        }

        .login-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 24px;
        }

        .brand-icon {
          color: var(--accent);
        }

        .brand-name {
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 0.12em;
          color: var(--text-primary);
        }

        .gateway-title-box {
          border-top: 1px solid var(--border-subtle);
          padding-top: 16px;
          margin-bottom: 24px;
        }

        .gateway-title {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: var(--text-primary);
          margin-top: 4px;
        }

        .gateway-subtitle {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 4px;
          line-height: 1.5;
        }

        .login-error-banner {
          background-color: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-left: 3px solid var(--status-critical);
          padding: 10px 14px;
          font-size: 11px;
          color: var(--status-critical);
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 20px;
        }

        .shrink-0 { flex-shrink: 0; }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-label {
          font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.08em;
        }

        .login-input {
          width: 100%;
          text-align: left;
          padding: 10px 14px;
          font-size: 12px;
        }

        .login-input:focus {
          outline: none;
          border-color: var(--accent);
        }

        .form-action {
          margin-top: 8px;
        }

        .login-submit-btn {
          width: 100%;
          justify-content: center;
          padding: 12px;
          font-size: 11px;
          letter-spacing: 0.1em;
        }

        .login-footer {
          border-top: 1px solid var(--border-subtle);
          margin-top: 28px;
          padding-top: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 9px;
          color: var(--text-tertiary);
        }

        .footer-val {
          color: var(--text-secondary);
        }

        .footer-sep {
          color: var(--border-strong);
        }

        .text-critical {
          color: var(--status-critical);
        }

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

export default LoginPage;
