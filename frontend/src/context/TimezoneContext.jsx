import React, { createContext, useContext, useState, useEffect } from 'react';

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
   * Format timestamp seconds into string formatted per selected timezone
   */
  const formatTimestamp = (timestampSeconds, includeSeconds = true) => {
    if (!timestampSeconds) return 'N/A';
    const date = new Date(timestampSeconds * 1000);

    if (timezone === 'LOCAL') {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return includeSeconds ? `${hours}:${minutes}:${seconds} LOCAL` : `${hours}:${minutes} LOCAL`;
    }

    const option = TIMEZONE_OPTIONS.find((t) => t.id === timezone) || TIMEZONE_OPTIONS[0];
    const offsetMs = (option.offsetMinutes || 0) * 60 * 1000;
    const adjustedDate = new Date(date.getTime() + offsetMs);

    const hours = String(adjustedDate.getUTCHours()).padStart(2, '0');
    const minutes = String(adjustedDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(adjustedDate.getUTCSeconds()).padStart(2, '0');

    return includeSeconds
      ? `${hours}:${minutes}:${seconds} ${option.id}`
      : `${hours}:${minutes} ${option.id}`;
  };

  /**
   * Format timestamp for chart X-axis
   */
  const formatChartTime = (timestampSeconds) => {
    if (!timestampSeconds) return '';
    return formatTimestamp(timestampSeconds, false);
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
