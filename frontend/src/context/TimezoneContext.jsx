import React, { createContext, useContext, useState } from 'react';

const TimezoneContext = createContext();

export const TIMEZONE_OPTIONS = [
  { id: 'UTC', name: 'UTC (Coordinated Universal Time)', iana: 'UTC' },
  { id: 'LOCAL', name: 'LOCAL (Browser System Time)', iana: undefined },
  { id: 'EST', name: 'EST (US Eastern Time - UTC-5)', iana: 'America/New_York' },
  { id: 'PST', name: 'PST (US Pacific Time - UTC-8)', iana: 'America/Los_Angeles' },
  { id: 'CET', name: 'CET (Central European Time - UTC+1)', iana: 'Europe/Paris' },
  { id: 'IST', name: 'IST (Indian Standard Time - UTC+5:30)', iana: 'Asia/Kolkata' },
];

export function TimezoneProvider({ children }) {
  const [timezone, setTimezoneState] = useState(() => {
    return localStorage.getItem('server_intel_timezone') || 'LOCAL';
  });

  const setTimezone = (newTz) => {
    setTimezoneState(newTz);
    localStorage.setItem('server_intel_timezone', newTz);
  };

  /**
   * Format timestamp into string formatted per selected timezone.
   * Handles UNIX epoch seconds, epoch milliseconds, ISO strings, or Date objects.
   */
  const formatTimestamp = (timestampInput, includeSeconds = true, includeTimezoneLabel = true) => {
    if (timestampInput === null || timestampInput === undefined || timestampInput === '') return 'N/A';

    let date;
    if (typeof timestampInput === 'number') {
      date = timestampInput > 1e11 ? new Date(timestampInput) : new Date(timestampInput * 1000);
    } else if (typeof timestampInput === 'string') {
      const num = Number(timestampInput);
      if (!isNaN(num)) {
        date = num > 1e11 ? new Date(num) : new Date(num * 1000);
      } else {
        date = new Date(timestampInput);
      }
    } else if (timestampInput instanceof Date) {
      date = timestampInput;
    }

    if (!date || isNaN(date.getTime())) return 'N/A';

    const option = TIMEZONE_OPTIONS.find((t) => t.id === timezone) || TIMEZONE_OPTIONS[0];
    const targetIana = timezone === 'LOCAL' ? undefined : (option.iana || 'UTC');

    const options = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...(includeSeconds ? { second: '2-digit' } : {}),
      ...(targetIana ? { timeZone: targetIana } : {}),
    };

    try {
      const formatted = new Intl.DateTimeFormat('en-GB', options).format(date);
      const label = timezone === 'LOCAL' 
        ? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'LOCAL')
        : timezone;
      return includeTimezoneLabel ? `${formatted} ${label}` : formatted;
    } catch (_err) {
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const seconds = String(date.getUTCSeconds()).padStart(2, '0');
      const timeStr = includeSeconds ? `${hours}:${minutes}:${seconds}` : `${hours}:${minutes}`;
      return includeTimezoneLabel ? `${timeStr} ${timezone}` : timeStr;
    }
  };

  /**
   * Format timestamp for chart X-axis (clean HH:MM in selected timezone)
   */
  const formatChartTime = (timestampInput) => {
    if (!timestampInput) return '';
    return formatTimestamp(timestampInput, false, false);
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
