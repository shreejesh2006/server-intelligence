import React, { createContext, useContext, useState } from 'react';

const TimezoneContext = createContext();

export const TIMEZONE_OPTIONS = [
  { id: 'UTC', name: 'UTC (Coordinated Universal Time)', offsetMinutes: 0 },
  { id: 'LOCAL', name: 'LOCAL (Browser System Time)', offsetMinutes: null },
  { id: 'EST', name: 'EST (US Eastern Time - UTC-5)', offsetMinutes: -300 },
  { id: 'PST', name: 'PST (US Pacific Time - UTC-8)', offsetMinutes: -480 },
  { id: 'CET', name: 'CET (Central European Time - UTC+1)', offsetMinutes: 60 },
  { id: 'IST', name: 'IST (Indian Standard Time - UTC+5:30)', offsetMinutes: 330 },
];

export function TimezoneProvider({ children }) {
  const [timezone, setTimezoneState] = useState(() => {
    return localStorage.getItem('server_intel_timezone') || 'UTC';
  });

  const setTimezone = (newTz) => {
    setTimezoneState(newTz);
    localStorage.setItem('server_intel_timezone', newTz);
  };

  /**
   * Format timestamp seconds into string formatted per selected timezone.
   * includeTimezoneLabel controls whether the suffix (e.g., IST, UTC) is appended.
   */
  const formatTimestamp = (timestampSeconds, includeSeconds = true, includeTimezoneLabel = true) => {
    if (!timestampSeconds) return 'N/A';
    const date = new Date(timestampSeconds * 1000);

    let hours, minutes, seconds, tzLabel;

    if (timezone === 'LOCAL') {
      hours = String(date.getHours()).padStart(2, '0');
      minutes = String(date.getMinutes()).padStart(2, '0');
      seconds = String(date.getSeconds()).padStart(2, '0');
      tzLabel = 'LOCAL';
    } else {
      const option = TIMEZONE_OPTIONS.find((t) => t.id === timezone) || TIMEZONE_OPTIONS[0];
      const offsetMs = (option.offsetMinutes || 0) * 60 * 1000;
      const adjustedDate = new Date(date.getTime() + offsetMs);

      hours = String(adjustedDate.getUTCHours()).padStart(2, '0');
      minutes = String(adjustedDate.getUTCMinutes()).padStart(2, '0');
      seconds = String(adjustedDate.getUTCSeconds()).padStart(2, '0');
      tzLabel = option.id;
    }

    const timeStr = includeSeconds
      ? `${hours}:${minutes}:${seconds}`
      : `${hours}:${minutes}`;

    return includeTimezoneLabel ? `${timeStr} ${tzLabel}` : timeStr;
  };

  /**
   * Format timestamp for chart X-axis (clean HH:MM without timezone label suffix)
   */
  const formatChartTime = (timestampSeconds) => {
    if (!timestampSeconds) return '';
    return formatTimestamp(timestampSeconds, false, false);
  };

  return (
    <TimezoneContext.Provider
      value={{
        timezone,
        setTimezone,
        formatTimestamp,
        formatChartTime,
        TIMEZONE_OPTIONS,
      }}
    >
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone() {
  const context = useContext(TimezoneContext);
  if (!context) {
    throw new Error('useTimezone must be used within a TimezoneProvider');
  }
  return context;
}

export default TimezoneContext;
