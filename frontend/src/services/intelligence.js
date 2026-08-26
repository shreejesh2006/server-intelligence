import apiClient from './api';

/**
 * Fetch telemetry forecasts for CPU, Memory, and Load 1m
 */
export async function getForecast(host = 'ubuntu') {
  const response = await apiClient.get('/api/intelligence/forecast', {
    params: { host },
  });
  return response.data;
}

/**
 * Fetch host-specific telemetry anomaly score and explainability
 */
export async function getAnomaly(host = 'ubuntu') {
  const response = await apiClient.get('/api/intelligence/anomaly', {
    params: { host },
  });
  return response.data;
}

/**
 * Fetch host-specific historical anomaly evaluations
 */
export async function getAnomalyHistory(host = 'ubuntu', lookback = '1h') {
  const response = await apiClient.get('/api/intelligence/anomaly/history', {
    params: {
      host,
      lookback,
    },
  });
  return response.data;
}
