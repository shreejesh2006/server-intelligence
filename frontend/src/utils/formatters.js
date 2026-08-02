/**
 * Format raw byte rates into human readable string (e.g. 1.2 MB/s)
 */
export function formatBytesPerSec(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) {
    return 'N/A';
  }
  const numeric = Number(bytes);
  if (numeric === 0) return '0 B/s';
  
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
  const i = Math.floor(Math.log(Math.abs(numeric)) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);
  const formatted = (numeric / Math.pow(k, idx)).toFixed(1);
  return `${formatted} ${sizes[idx]}`;
}

/**
 * Format percentages cleanly (e.g., 24.8%)
 */
export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }
  return `${Number(value).toFixed(decimals)}%`;
}

/**
 * Format uptime seconds into human-readable duration (e.g. 8h 53m)
 */
export function formatUptime(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) {
    return 'N/A';
  }
  const totalSeconds = Math.floor(Number(seconds));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${totalSeconds % 60}s`;
}

/**
 * Format raw number with fixed precision
 */
export function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A';
  }
  return Number(value).toFixed(decimals);
}

/**
 * Format UNIX timestamp to UTC time string (e.g., 12:31:30)
 */
export function formatUtcTime(timestampSeconds) {
  if (!timestampSeconds) return 'N/A';
  const date = new Date(timestampSeconds * 1000);
  return date.toISOString().substring(11, 19) + ' UTC';
}

/**
 * Format UNIX timestamp for chart axis
 */
export function formatChartTime(timestampSeconds) {
  if (!timestampSeconds) return '';
  const date = new Date(timestampSeconds * 1000);
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
