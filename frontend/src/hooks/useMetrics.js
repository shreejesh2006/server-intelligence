import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentMetrics, getHealthStatus } from '../services/metrics';

export function useMetrics(pollIntervalMs = 30000) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);

  const isMounted = useRef(true);

  const fetchTelemetry = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setLoading(true);
    }
    try {
      // Fetch health and current metrics
      const [healthRes, metricsRes] = await Promise.all([
        getHealthStatus().catch(() => null),
        getCurrentMetrics(),
      ]);

      if (!isMounted.current) return;

      if (metricsRes && metricsRes.status === 'success') {
        setMetrics(metricsRes.metrics || {});
        setIsOffline(false);
        setError(null);
        setLastUpdated(new Date());
      } else {
        throw new Error('Invalid telemetry response');
      }
    } catch (err) {
      if (!isMounted.current) return;
      console.warn('Telemetry fetch error:', err.message);
      setIsOffline(true);
      setError(err.message || 'API unreachable');
      // Do not clear existing metrics on transient error to keep UI stable
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetchTelemetry(true);

    const interval = setInterval(() => {
      fetchTelemetry(false);
    }, pollIntervalMs);

    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [fetchTelemetry, pollIntervalMs]);

  return {
    metrics,
    loading,
    isOffline,
    lastUpdated,
    error,
    refetch: () => fetchTelemetry(false),
  };
}

export default useMetrics;
