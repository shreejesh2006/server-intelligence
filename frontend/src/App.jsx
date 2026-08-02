import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { TimezoneProvider } from './context/TimezoneContext';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './components/common/ProtectedRoute';
import useMetrics from './hooks/useMetrics';

import LoginPage from './pages/Login/LoginPage';
import OverviewPage from './pages/Overview/OverviewPage';
import ServersPage from './pages/Servers/ServersPage';
import ForecastsPage from './pages/Forecasts/ForecastsPage';
import AnomaliesPage from './pages/Anomalies/AnomaliesPage';
import AlertsPage from './pages/Alerts/AlertsPage';
import AnalyticsPage from './pages/Analytics/AnalyticsPage';
import UsersPage from './pages/Users/UsersPage';
import SettingsPage from './pages/Settings/SettingsPage';

function AuthenticatedAppShell() {
  const { metrics, loading, isOffline, lastUpdated, refetch } = useMetrics(30000);

  return (
    <AppShell
      isOffline={isOffline}
      lastUpdated={lastUpdated}
      onRefresh={refetch}
      loading={loading}
    >
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
              <ForecastsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/anomalies"
          element={
            <ProtectedRoute>
              <AnomaliesPage />
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
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </AppShell>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TimezoneProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/*" element={<AuthenticatedAppShell />} />
            </Routes>
          </BrowserRouter>
        </TimezoneProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
