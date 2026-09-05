import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { TimezoneProvider } from './context/TimezoneContext';
import { ServerProvider, useServer } from './context/ServerContext';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './components/common/ProtectedRoute';
import ErrorBoundary from './components/common/ErrorBoundary';
import useMetrics from './hooks/useMetrics';
import { RefreshCw } from 'lucide-react';

// Code-split page components with React.lazy
const LoginPage = lazy(() => import('./pages/Login/LoginPage'));
const OverviewPage = lazy(() => import('./pages/Overview/OverviewPage'));
const ServersPage = lazy(() => import('./pages/Servers/ServersPage'));
const ForecastsPage = lazy(() => import('./pages/Forecasts/ForecastsPage'));
const AnomaliesPage = lazy(() => import('./pages/Anomalies/AnomaliesPage'));
const AlertsPage = lazy(() => import('./pages/Alerts/AlertsPage'));
const AnalyticsPage = lazy(() => import('./pages/Analytics/AnalyticsPage'));
const UsersPage = lazy(() => import('./pages/Users/UsersPage'));
const SettingsPage = lazy(() => import('./pages/Settings/SettingsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFound/NotFoundPage'));



// Page loading fallback indicator
function PageFallback() {
  return (
    <div className="page-suspense-fallback font-mono">
      <RefreshCw size={16} className="spinning text-accent" />
      <span>LOADING SURFACE MODULE...</span>
      <style>{`
        .page-suspense-fallback {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 60px 0;
          color: var(--text-tertiary);
          font-size: 11px;
          letter-spacing: 0.08em;
        }
        .text-accent { color: var(--accent); }
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function AuthenticatedAppShell() {
  const { selectedHost } = useServer();
  const { metrics, loading, isOffline, lastUpdated, freshnessState, freshnessLabel, refetch } = useMetrics(selectedHost, 30000);

  return (
    <AppShell
      isOffline={isOffline}
      lastUpdated={lastUpdated}
      onRefresh={refetch}
      loading={loading}
      freshnessState={freshnessState}
      freshnessLabel={freshnessLabel}
    >
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route
            path="/"
            element={<Navigate to="/overview" replace />}
          />
          <Route
            path="/overview"
            element={
              <ProtectedRoute>
                <OverviewPage
                  metrics={metrics}
                  isOffline={isOffline}
                  lastUpdated={lastUpdated}
                  refetch={refetch}
                  loading={loading}
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/servers"
            element={
              <ProtectedRoute>
                <ServersPage
                  metrics={metrics}
                  isOffline={isOffline}
                  lastUpdated={lastUpdated}
                  refetch={refetch}
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/forecasts"
            element={
              <ProtectedRoute>
                <ForecastsPage
                  metrics={metrics}
                  isOffline={isOffline}
                  lastUpdated={lastUpdated}
                  refetch={refetch}
                />
              </ProtectedRoute>
            }
          />

          <Route
            path="/anomalies"
            element={
              <ProtectedRoute>
                <AnomaliesPage
                  isOffline={isOffline}
                  lastUpdated={lastUpdated}
                  refetch={refetch}
                />
              </ProtectedRoute>
            }
          />

          <Route
            path="/alerts"
            element={
              <ProtectedRoute>
                <AlertsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <AnalyticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assistant"
            element={<Navigate to="/overview" replace />}
          />

          <Route
            path="*"
            element={
              <ProtectedRoute>
                <NotFoundPage />
              </ProtectedRoute>
            }
          />

        </Routes>
      </Suspense>
    </AppShell>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <TimezoneProvider>
            <ServerProvider>
              <BrowserRouter>
                <Suspense fallback={<PageFallback />}>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/*" element={<AuthenticatedAppShell />} />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </ServerProvider>
          </TimezoneProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
