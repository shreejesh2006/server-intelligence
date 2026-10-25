import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentMetrics, getHealthStatus } from '../services/metrics';

export function useMetrics(targetHost = null, pollIntervalMs = 30000) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [latestMetricTimestamp, setLatestMetricTimestamp] = useState(null);
  const [error, setError] = useState(null);

  const isMounted = useRef(true);

  const fetchTelemetry = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setLoading(true);
    }
    try {
      // Fetch health and current metrics for specified host
      const [, metricsRes] = await Promise.all([
        getHealthStatus().catch(() => null),
        getCurrentMetrics(targetHost),
      ]);

      if (!isMounted.current) return;

      if (metricsRes && metricsRes.status === 'success') {
        const fetchedMetrics = metricsRes.metrics || {};
        if (import.meta.env.DEV || process.env.NODE_ENV !== 'production') {
          console.log('[useMetrics]', { targetHost, metricsRes, fetchedMetrics });
        }
        setMetrics(fetchedMetrics);
        setIsOffline(false);
        setError(null);
        setLastUpdated(new Date());

        // Set latest metric timestamp to evaluate telemetry freshness
        if (metricsRes.timestamp) {
          const tsSec = typeof metricsRes.timestamp === 'number'
            ? metricsRes.timestamp
            : Math.floor(new Date(metricsRes.timestamp).getTime() / 1000);
          if (!isNaN(tsSec) && tsSec > 0) {
            setLatestMetricTimestamp(tsSec);
          }
        } else {
          let maxTs = 0;
          Object.values(fetchedMetrics).forEach((m) => {
            if (m && typeof m === 'object' && typeof m.timestamp === 'number' && m.timestamp > maxTs) {
              maxTs = m.timestamp;
            }
          });
          if (maxTs > 0) {
            setLatestMetricTimestamp(maxTs);
          }
        }
      } else {
        throw new Error('Invalid telemetry response');
      }
    } catch (err) {
      if (!isMounted.current) return;
      if (import.meta.env.DEV || process.env.NODE_ENV !== 'production') {
        console.warn('[useMetrics] Telemetry fetch error:', err.message);
      }
      setIsOffline(true);
      setError(err.message || 'API unreachable');
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [targetHost]);

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

  // Determine data freshness state
  let freshnessState = 'FRESH';
  let freshnessLabel = 'Connected';

  if (isOffline) {
    freshnessState = 'OFFLINE';
    freshnessLabel = 'API OFFLINE';
  } else if (lastUpdated) {
    const ageSeconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (ageSeconds > 120) {
      freshnessState = 'STALE';
      freshnessLabel = 'Connection Stale';
    }
  }

  return {
    metrics,
    loading,
    isOffline,
    lastUpdated,
    freshnessState,
    freshnessLabel,
    error,
    refetch: () => fetchTelemetry(true),
  };
}

export default useMetrics;
