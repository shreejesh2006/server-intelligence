import apiClient from './api';

/**
 * Query operational logs with host, level, time range, and search expression filters.
 */
export async function queryLogs(params = {}) {
  const queryParams = {};
  if (params.host) queryParams.host = params.host;
  if (params.start) queryParams.start = params.start;
  if (params.end) queryParams.end = params.end;
  if (params.level) queryParams.level = params.level;
  if (params.source) queryParams.source = params.source;
  if (params.query) queryParams.query = params.query;
  if (params.limit) queryParams.limit = params.limit;

  const response = await apiClient.get('/api/logs/query', { params: queryParams });
  return response.data;
}

/**
 * Correlate operational logs surrounding a specific timestamp/incident event.
 */
export async function correlateLogs(host, timestamp, windowMinutes = 15, level = null) {
  const params = {
    host,
    timestamp,
    window_minutes: windowMinutes,
  };
  if (level) params.level = level;

  const response = await apiClient.get('/api/logs/correlate', { params });
  return response.data;
}

/**
 * Check VictoriaLogs service health.
 */
export async function getLogsHealth() {
  const response = await apiClient.get('/api/logs/health');
  return response.data;
}
