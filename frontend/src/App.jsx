import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { ThemeProvider } from './context/ThemeContext';
import AppShell from './components/layout/AppShell';
import useMetrics from './hooks/useMetrics';

import OverviewPage from './pages/Overview/OverviewPage';
import ServersPage from './pages/Servers/ServersPage';
import ForecastsPage from './pages/Forecasts/ForecastsPage';
import AnomaliesPage from './pages/Anomalies/AnomaliesPage';
import AlertsPage from './pages/Alerts/AlertsPage';
import AnalyticsPage from './pages/Analytics/AnalyticsPage';
import UsersPage from './pages/Users/UsersPage';
import SettingsPage from './pages/Settings/SettingsPage';

function AppContent() {
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
            <OverviewPage
              metrics={metrics}
              isOffline={isOffline}
              lastUpdated={lastUpdated}
              refetch={refetch}
              loading={loading}
            />
          }
        />
        <Route
          path="/servers"
          element={
            <ServersPage
              metrics={metrics}
              isOffline={isOffline}
              lastUpdated={lastUpdated}
              refetch={refetch}
            />
          }
        />
        <Route path="/forecasts" element={<ForecastsPage />} />
        <Route path="/anomalies" element={<AnomaliesPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </AppShell>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
