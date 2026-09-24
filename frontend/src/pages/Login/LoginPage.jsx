import React, { useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { 
  Eye, 
  EyeOff, 
  AlertCircle,
  RefreshCw
} from 'lucide-react';

export function LoginPage() {
  const { isAuthenticated, login, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('admin');
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

      if (status === 401 || status === 400 || status === 422) {
        setErrorMessage('Invalid username or password.');
      } else if (status === 403) {
        setErrorMessage('Account access restricted. Please contact your administrator.');
      } else {
        setErrorMessage('Invalid username or password.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="netra-split-login-page font-sans">
      {/* LEFT PANEL — ANIMATED INFRASTRUCTURE VISUAL (50%) */}
      <div className="login-visual-panel">
        <div className="visual-graphic-container">
          <svg className="geometric-pattern-svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Background Dot Matrix */}
            <g opacity="0.3">
              {[120, 240, 360, 480, 500, 620, 740, 860].map((x) =>
                [120, 240, 360, 480, 500, 620, 740, 860].map((y) => (
                  <circle key={`dot-${x}-${y}`} cx={x} cy={y} r="1.5" fill="var(--text-muted)" />
                ))
              )}
            </g>

            {/* Fine Axis Crosshair Lines */}
            <g opacity="0.15" stroke="var(--border-strong)" strokeWidth="1">
              <line x1="500" y1="50" x2="500" y2="950" strokeDasharray="4 6" />
              <line x1="50" y1="500" x2="950" y2="500" strokeDasharray="4 6" />
            </g>

            {/* Outermost Concentric Ring (Radius 440, Clockwise slow) */}
            <g className="geo-rotate-cw" transform-origin="500 500">
              <circle cx="500" cy="500" r="440" stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="8 14" opacity="0.4" />
              <circle cx="500" cy="60" r="5" fill="var(--text-secondary)" />
              <circle cx="500" cy="940" r="5" fill="var(--text-secondary)" />
              <circle cx="60" cy="500" r="5" fill="var(--text-secondary)" />
              <circle cx="940" cy="500" r="5" fill="var(--text-secondary)" />
            </g>

            {/* Large Outer Concentric Ring (Radius 340, Counter-clockwise) */}
            <g className="geo-rotate-ccw" transform-origin="500 500">
              <circle cx="500" cy="500" r="340" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 8" opacity="0.5" />
              <rect x="491" y="152" width="18" height="18" rx="4" fill="var(--text-primary)" opacity="0.7" />
              <rect x="491" y="830" width="18" height="18" rx="4" fill="var(--text-primary)" opacity="0.7" />
              <rect x="152" y="491" width="18" height="18" rx="4" fill="var(--text-primary)" opacity="0.7" />
              <rect x="830" y="491" width="18" height="18" rx="4" fill="var(--text-primary)" opacity="0.7" />
            </g>

            {/* Middle Ring (Radius 240, Solid) */}
            <circle cx="500" cy="500" r="240" stroke="var(--border-subtle)" strokeWidth="1.5" opacity="0.8" />

            {/* Central Overlapping Geometric Composition */}
            <g className="geo-pulse" transform-origin="500 500">
              {/* Large Rotated Diamond Rounded Square */}
              <g transform="translate(500 500) rotate(45)">
                <rect x="-180" y="-180" width="360" height="360" rx="48" stroke="var(--text-primary)" strokeWidth="1.5" fill="var(--bg-canvas)" fillOpacity="0.3" opacity="0.25" />
              </g>

              {/* Intersecting Rounded Rectangles */}
              <g transform="translate(500 500)">
                <rect x="-250" y="-115" width="500" height="230" rx="36" stroke="var(--border-strong)" strokeWidth="1.2" fill="var(--bg-surface)" fillOpacity="0.5" />
                <rect x="-115" y="-250" width="230" height="500" rx="36" stroke="var(--border-strong)" strokeWidth="1.2" fill="var(--bg-surface)" fillOpacity="0.5" />
                
                {/* Inner Central Nested Rounded Square */}
                <rect x="-95" y="-95" width="190" height="190" rx="30" stroke="var(--text-primary)" strokeWidth="1.5" fill="var(--bg-canvas)" />
                
                {/* Central Iris & Circle Details */}
                <circle cx="0" cy="0" r="54" stroke="var(--text-primary)" strokeWidth="1.5" fill="none" />
                <circle cx="0" cy="0" r="28" fill="var(--accent-primary)" opacity="0.12" />
                <circle cx="0" cy="0" r="10" fill="var(--text-primary)" />
              </g>
            </g>
          </svg>
        </div>
      </div>

      {/* RIGHT PANEL — LOGIN FORM (50%) */}
      <div className="login-form-panel">
        <div className="form-content-wrapper">
          {/* Brand Header */}
          <div className="netra-brand-header">
            <h1 className="netra-wordmark">
              Netra Intelligence
            </h1>
          </div>

          {/* Error Banner only after login attempt */}
          {errorMessage && (
            <div className="banner banner-error font-sans">
              <AlertCircle size={15} className="banner-icon" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-field">
              <label htmlFor="username-input" className="field-label">
                Username
              </label>
              <input
                id="username-input"
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSubmitting}
                className="netra-input"
              />
            </div>

            <div className="form-field">
              <label htmlFor="password-input" className="field-label">
                Password
              </label>
              <div className="input-pass-wrapper">
                <input
                  id="password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  className="netra-input input-pass"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="pass-toggle-btn"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !username.trim() || !password.trim()}
              className="submit-btn"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={15} className="spinning" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign in</span>
              )}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        .netra-split-login-page {
          min-height: 100vh;
          width: 100vw;
          display: flex;
          background-color: var(--bg-canvas);
          overflow: hidden;
        }

        /* LEFT PANEL (50%) */
        .login-visual-panel {
          width: 50%;
          min-height: 100vh;
          background-color: var(--bg-surface);
          border-right: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        .visual-graphic-container {
          width: 100%;
          height: 100%;
          max-width: 720px;
          max-height: 720px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .geometric-pattern-svg {
          width: 100%;
          height: 100%;
        }

        .geo-rotate-cw {
          animation: geoRotateCW 90s linear infinite;
        }

        .geo-rotate-ccw {
          animation: geoRotateCCW 60s linear infinite;
        }

        .geo-pulse {
          animation: geoPulse 6s ease-in-out infinite;
        }

        .geo-float-slow {
          animation: geoFloat 4s ease-in-out infinite;
        }

        @keyframes geoRotateCW {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes geoRotateCCW {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }

        @keyframes geoPulse {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          50% { transform: scale(1.02); opacity: 1; }
        }

        @keyframes geoFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }

        /* RIGHT PANEL (50%) */
        .login-form-panel {
          width: 50%;
          min-height: 100vh;
          background-color: var(--bg-canvas);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
        }

        .form-content-wrapper {
          width: 100%;
          max-width: 360px;
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        /* Brand Wordmark */
        .netra-brand-header {
          display: flex;
          align-items: center;
        }

        .netra-wordmark {
          font-size: 32px;
          font-weight: 600;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          display: inline-flex;
          align-items: center;
          margin: 0;
        }

        /* Banners */
        .banner {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: var(--radius-sm);
          font-size: 13px;
          line-height: 1.4;
        }

        .banner-icon {
          flex-shrink: 0;
        }

        .banner-info {
          background-color: var(--status-info-bg);
          color: var(--status-info);
        }

        .banner-error {
          background-color: var(--status-critical-bg);
          color: var(--status-critical);
        }

        /* Form Controls */
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .input-pass-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .netra-input {
          width: 100%;
          height: 44px;
          padding: 0 14px;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          font-family: var(--font-sans);
          font-size: 14px;
          color: var(--text-primary);
          outline: none;
          transition: border-color 0.15s ease;
        }

        .netra-input:focus {
          border-color: var(--border-strong);
        }

        .input-pass {
          padding-right: 44px;
        }

        .pass-toggle-btn {
          position: absolute;
          right: 10px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
        }

        .pass-toggle-btn:hover {
          color: var(--text-primary);
        }

        .submit-btn {
          width: 100%;
          height: 44px;
          background-color: var(--text-primary);
          color: var(--bg-canvas);
          border: none;
          border-radius: var(--radius-sm);
          font-family: var(--font-sans);
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: opacity 0.15s ease;
          margin-top: 4px;
        }

        .submit-btn:hover:not(:disabled) {
          opacity: 0.9;
        }

        .submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          100% { transform: rotate(360deg); }
        }

        /* RESPONSIVE LAYOUT */
        @media (max-width: 768px) {
          .netra-split-login-page {
            flex-direction: column;
          }

          .login-visual-panel {
            width: 100%;
            min-height: 240px;
            padding: 24px;
            border-right: none;
            border-bottom: 1px solid var(--border-subtle);
          }

          .visual-graphic-container {
            max-width: 240px;
          }

          .login-form-panel {
            width: 100%;
            min-height: auto;
            padding: 40px 24px;
          }
        }
      `}</style>
    </div>
  );
}

export default LoginPage;
