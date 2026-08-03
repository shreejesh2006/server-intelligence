import apiClient from './api';

/**
 * Fetch telemetry forecasts for CPU, Memory, and Load 1m
 */
export async function getForecast() {
  const response = await apiClient.get('/api/intelligence/forecast');
  return response.data;
}

/**
 * Fetch telemetry anomaly score and evaluation
 */
export async function getAnomaly() {
  const response = await apiClient.get('/api/intelligence/anomaly');
  return response.data;
}
