import React from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import AccessDenied from './AccessDenied';
import { RefreshCw } from 'lucide-react';

export function ProtectedRoute({ children, allowedRoles }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Startup validation phase: render clean editorial loading screen
  if (isLoading) {
    return (
      <div className="auth-loading-screen font-mono">
        <div className="loading-box">
          <RefreshCw size={18} className="spinning text-accent" />
          <span className="loading-title">AUTHENTICATING SESSION...</span>
          <span className="loading-subtitle">Validating JWT against /api/auth/me</span>
        </div>

        <style>{`
          .auth-loading-screen {
            min-height: 100vh;
            background-color: var(--bg-main);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .loading-box {
            background-color: var(--bg-surface);
            border: 1px solid var(--border-strong);
            padding: 32px 40px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            text-align: center;
          }
          .loading-title {
            font-size: 12px;
            font-weight: 700;
            color: var(--text-primary);
            letter-spacing: 0.1em;
          }
          .loading-subtitle {
            font-size: 10px;
            color: var(--text-tertiary);
          }
          .text-accent {
            color: var(--accent);
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

  // Anonymous user: redirect to /login with target location memory
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Allowed roles check
  if (allowedRoles && allowedRoles.length > 0) {
    if (!user || !allowedRoles.includes(user.role)) {
      return <AccessDenied requiredRole={allowedRoles.join(' / ')} />;
    }
  }

  return children;
}

export default ProtectedRoute;
