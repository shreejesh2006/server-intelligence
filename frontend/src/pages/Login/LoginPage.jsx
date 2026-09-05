import React, { useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { 
  Activity, 
  Lock, 
  AlertOctagon, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  Info,
  Server,
  Cpu,
  ShieldCheck,
  Zap,
  HardDrive,
  User,
  KeyRound,
  ArrowRight,
  Globe
} from 'lucide-react';

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
      {/* BACKGROUND LAYER: ANIMATED MOVING GRAPHICAL WAVES & NETWORK CONSTELLATION */}
      <div className="animated-graph-background">
        {/* Animated Moving Wave Graphs SVG */}
        <svg className="moving-waves-svg" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Background Grid Lines */}
          <path d="M0 150 H1440 M0 300 H1440 M0 450 H1440 M0 600 H1440 M0 750 H1440" stroke="var(--border-subtle)" strokeDasharray="4 4" opacity="0.35" />
          <path d="M180 0 V900 M360 0 V900 M540 0 V900 M720 0 V900 M900 0 V900 M1080 0 V900 M1260 0 V900" stroke="var(--border-subtle)" strokeDasharray="4 4" opacity="0.35" />

          {/* Wave 1: Primary Accent Green Telemetry Graph (Smooth Multi-Period Sine Wave) */}
          <path 
            className="moving-wave wave-primary" 
            d="M -100 450 C 180 220, 420 680, 720 450 C 1020 220, 1260 680, 1540 450" 
            stroke="var(--accent)" 
            strokeWidth="3" 
            strokeLinecap="round" 
            opacity="0.7" 
          />

          {/* Wave 2: Cyan Info Secondary Graph */}
          <path 
            className="moving-wave wave-secondary" 
            d="M -100 320 C 220 580, 500 120, 720 320 C 940 520, 1220 120, 1540 320" 
            stroke="var(--status-info, #38bdf8)" 
            strokeWidth="2.2" 
            strokeDasharray="6 6" 
            opacity="0.5" 
          />

          {/* Wave 3: Amber Load Graph */}
          <path 
            className="moving-wave wave-tertiary" 
            d="M -100 580 C 150 320, 460 780, 720 580 C 980 380, 1290 780, 1540 580" 
            stroke="var(--status-warning, #f59e0b)" 
            strokeWidth="1.8" 
            opacity="0.4" 
          />

          {/* Network Constellation Nodes & Pulses */}
          <circle cx="280" cy="335" r="5" fill="var(--accent)" />
          <circle cx="280" cy="335" r="14" stroke="var(--accent)" strokeWidth="1.5" className="pulse-ring-bg" />

          <circle cx="580" cy="565" r="6" fill="var(--status-info, #38bdf8)" />
          <circle cx="580" cy="565" r="16" stroke="var(--status-info, #38bdf8)" strokeWidth="1.5" className="pulse-ring-bg" />

          <circle cx="860" cy="335" r="5" fill="var(--status-warning, #f59e0b)" />
          <circle cx="860" cy="335" r="14" stroke="var(--status-warning, #f59e0b)" strokeWidth="1.5" className="pulse-ring-bg" />

          <circle cx="1160" cy="565" r="6" fill="var(--accent)" />
          <circle cx="1160" cy="565" r="18" stroke="var(--accent)" strokeWidth="1.5" className="pulse-ring-bg" />
        </svg>

      </div>

      {/* CENTERED FLOATING LOGIN CARD */}
      <div className="login-centered-card-wrapper font-mono">
        {/* DOTTED GLOBE GRAPHIC (ANCHORED BEHIND TOP-LEFT CORNER OF LOGIN BOX) */}
        <div className="bg-dotted-globe-container">
          <svg className="bg-dotted-globe-svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="100" cy="100" r="90" stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
            <circle cx="100" cy="100" r="75" stroke="var(--accent-border)" strokeWidth="1" opacity="0.4" />

            <ellipse cx="100" cy="100" rx="75" ry="30" stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
            <ellipse cx="100" cy="100" rx="75" ry="55" stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
            <ellipse cx="100" cy="100" rx="30" ry="75" stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
            <ellipse cx="100" cy="100" rx="55" ry="75" stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />

            <g fill="var(--accent)" opacity="0.65">
              <circle cx="100" cy="100" r="2.5" />
              <circle cx="70" cy="100" r="2" />
              <circle cx="130" cy="100" r="2" />
              <circle cx="40" cy="100" r="1.8" />
              <circle cx="160" cy="100" r="1.8" />
              <circle cx="100" cy="70" r="2" />
              <circle cx="100" cy="130" r="2" />
              <circle cx="100" cy="40" r="1.8" />
              <circle cx="100" cy="160" r="1.8" />
              <circle cx="78" cy="78" r="1.8" />
              <circle cx="122" cy="78" r="1.8" />
              <circle cx="78" cy="122" r="1.8" />
              <circle cx="122" cy="122" r="1.8" />
            </g>
          </svg>
        </div>

        <div className="neo-card login-card-glass font-mono">
          {/* Brand Header */}
          <div className="login-card-brand font-sans flex-between border-bottom padding-bottom-sm">
            <div className="flex-center gap-xs">
              <div className="brand-logo-box">
                <Activity size={22} className="text-accent" />
              </div>
              <div>
                <span className="brand-title font-bold">SERVER INTELLIGENCE</span>
                <div className="brand-tag font-mono text-tertiary text-xs">v0.1.0-INDUSTRIAL</div>
              </div>
            </div>
            <span className="editorial-pill pill-healthy font-mono">ONLINE</span>
          </div>

          <div className="gateway-header-strip margin-top-md">
            <h2 className="gateway-title font-sans font-bold">Sign in to Console</h2>
            <p className="gateway-subtitle font-sans text-xs text-secondary margin-top-xs">
              Enter your administrative credentials to access telemetry dashboard.
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
              <div className="input-with-icon">
                <User size={14} className="input-icon text-tertiary" />
                <input
                  id="username-input"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username (e.g. admin)"
                  disabled={isSubmitting}
                  className="neo-input login-input input-padded"
                />
              </div>
            </div>

            <div className="field-group margin-top-md">
              <label htmlFor="password-input" className="field-label text-tertiary">
                PASSWORD:
              </label>
              <div className="input-with-icon">
                <KeyRound size={14} className="input-icon text-tertiary" />
                <input
                  id="password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  disabled={isSubmitting}
                  className="neo-input login-input input-padded pass-padded"
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
                    <RefreshCw size={14} className="spin" />
                    <span>AUTHENTICATING SESSION...</span>
                  </>
                ) : (
                  <>
                    <span>SIGN IN TO CONSOLE</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <style>{`
        .margin-top-xs { margin-top: 6px; }
        .margin-top-md { margin-top: 20px; }
        .margin-top-lg { margin-top: 28px; }
        .padding-bottom-xs { padding-bottom: 8px; }
        .padding-bottom-sm { padding-bottom: 12px; }
        .padding-top-sm { padding-top: 14px; }
        .border-bottom { border-bottom: 1px solid var(--border-subtle); }
        .border-top { border-top: 1px solid var(--border-subtle); }
        .flex-between { display: flex; justify-content: space-between; align-items: center; }
        .flex-center { display: flex; align-items: center; }
        .gap-xs { gap: 8px; }

        .login-gateway-page {
          min-height: 100vh;
          width: 100vw;
          background-color: var(--bg-app);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          padding: 20px;
        }

        .animated-graph-background {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 1;
        }

        .moving-waves-svg {
          width: 100%;
          height: 100%;
          position: absolute;
          top: 0;
          left: 0;
        }

        .moving-wave {
          stroke-dasharray: 900;
          stroke-dashoffset: 900;
          animation: waveDraw 12s linear infinite alternate;
        }

        .wave-primary {
          animation-duration: 14s;
        }
        .wave-secondary {
          animation-duration: 18s;
        }
        .wave-tertiary {
          animation-duration: 24s;
        }

        @keyframes waveDraw {
          0% { stroke-dashoffset: 900; }
          100% { stroke-dashoffset: 0; }
        }

        .pulse-ring-bg {
          animation: pulseRingBg 3s ease-out infinite;
          transform-origin: center;
        }

        @keyframes pulseRingBg {
          0% { opacity: 0.8; }
          100% { opacity: 0; }
        }

        .login-centered-card-wrapper {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 440px;
        }

        .bg-dotted-globe-container {
          position: absolute;
          top: -90px;
          left: -110px;
          width: 320px;
          height: 320px;
          opacity: 0.45;
          pointer-events: none;
          z-index: -1;
        }

        .bg-dotted-globe-svg {
          width: 100%;
          height: 100%;
          animation: globeSpin 50s linear infinite;
        }

        @keyframes globeSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .login-centered-card-wrapper {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 440px;
        }

        .login-card-glass {
          padding: 36px 32px;
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-raised-lg);
        }

        .brand-logo-box {
          width: 40px;
          height: 40px;
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .brand-title {
          font-size: 15px;
          letter-spacing: 0.04em;
          color: var(--text-primary);
        }

        .gateway-title {
          font-size: 22px;
          letter-spacing: -0.02em;
          color: var(--text-primary);
        }

        .editorial-notice-banner {
          padding: 10px 14px;
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
          gap: 6px;
        }

        .field-label {
          font-size: 10px;
          letter-spacing: 0.06em;
        }

        .input-with-icon {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 12px;
          pointer-events: none;
        }

        .input-padded {
          padding-left: 36px !important;
          width: 100%;
          height: 40px;
          font-size: 12px;
        }

        .pass-padded {
          padding-right: 40px !important;
        }

        .pass-toggle-btn {
          position: absolute;
          right: 6px;
          width: 28px;
          height: 28px;
        }

        .btn-submit {
          width: 100%;
          height: 42px;
          justify-content: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 700;
        }

        .badge-row {
          font-size: 10px;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .shrink-0 { flex-shrink: 0; }
        .text-accent { color: var(--accent); }
        .text-info { color: var(--status-info, #38bdf8); }
        .text-warning { color: var(--status-warning, #f59e0b); }
        .text-healthy { color: var(--status-healthy); }
        .text-tertiary { color: var(--text-tertiary); }
        .text-secondary { color: var(--text-secondary); }
        .text-primary { color: var(--text-primary); }
      `}</style>
    </div>
  );
}

export default LoginPage;
