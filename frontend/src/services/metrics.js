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
 * Fetch current system telemetry metrics for a specific host or default
 * @param {string} [host] - Host label (e.g. 'ubuntu' or 'Kali')
 */
export async function getCurrentMetrics(host) {
  const params = host ? { host } : {};
  const response = await apiClient.get('/api/metrics/current', { params });
  return response.data;
}

/**
 * Fetch historical metrics for a specific metric name and host
 * @param {string} metricName
 * @param {string} [start]
 * @param {string} [end]
 * @param {string} [step]
 * @param {string} [host]
 */
export async function getMetricHistory(metricName, start = '-1h', end = 'now', step = '30s', host = null) {
  const params = { start, end, step };
  if (host) {
    params.host = host;
  }
  const response = await apiClient.get(`/api/metrics/${metricName}`, { params });
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
 * @param {Array<string>} metricNames
 * @param {string} [start]
 * @param {string} [end]
 * @param {string} [step]
 * @param {string} [host]
 */
export async function getMultiMetricHistory(metricNames = [], start = '-1h', end = 'now', step = '30s', host = null) {
  const promises = metricNames.map((name) =>
    getMetricHistory(name, start, end, step, host).catch((err) => ({
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
