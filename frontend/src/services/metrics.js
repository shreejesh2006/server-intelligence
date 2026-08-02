import apiClient from './api';

/**
 * Check backend health status
 */
export async function getHealthStatus() {
  const response = await apiClient.get('/health');
  return response.data;
}

/**
 * List available metric names
 */
export async function getAvailableMetrics() {
  const response = await apiClient.get('/api/metrics/');
  return response.data;
}

/**
 * Fetch current system telemetry metrics
 */
export async function getCurrentMetrics() {
  const response = await apiClient.get('/api/metrics/current');
  return response.data;
}

/**
 * Fetch historical metrics for a specific metric name
 */
export async function getMetricHistory(metricName, start = '-1h', end = 'now', step = '30s') {
  const response = await apiClient.get(`/api/metrics/${metricName}`, {
    params: { start, end, step },
  });
  const data = response.data;

  // Transform values array for Recharts compatibility
  const formattedValues = (data.values || []).map((item) => ({
    timestamp: item.timestamp,
    value: item.value,
  }));

  return {
    ...data,
    values: formattedValues,
  };
}

/**
 * Fetch multiple historical metrics in parallel for multi-series charts
 */
export async function getMultiMetricHistory(metricNames = [], start = '-1h', end = 'now', step = '30s') {
  const promises = metricNames.map((name) =>
    getMetricHistory(name, start, end, step).catch((err) => ({
      metric: name,
      values: [],
      error: err,
    }))
  );

  const results = await Promise.all(promises);

  // Map by metric name
  const metricsMap = {};
  results.forEach((res) => {
    metricsMap[res.metric] = res.values || [];
  });

  // Merge timestamps into a single timeline array
  const timestampMap = new Map();

  results.forEach((res) => {
    (res.values || []).forEach((point) => {
      const ts = point.timestamp;
      if (!timestampMap.has(ts)) {
        timestampMap.set(ts, { timestamp: ts });
      }
      timestampMap.get(ts)[res.metric] = point.value;
    });
  });

  const mergedTimeline = Array.from(timestampMap.values()).sort(
    (a, b) => a.timestamp - b.timestamp
  );

  return {
    metrics: metricsMap,
    timeline: mergedTimeline,
  };
}
