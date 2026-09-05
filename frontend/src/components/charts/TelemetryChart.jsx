import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useTimezone } from '../../context/TimezoneContext';

function getAdaptiveTicks(data, targetCount = 7) {
  if (!data || data.length === 0) return [];
  if (data.length <= targetCount) return data.map((d) => d.timestamp);

  const ticks = [];
  const total = data.length;
  const step = (total - 1) / (targetCount - 1);
  for (let i = 0; i < targetCount; i++) {
    const idx = Math.min(Math.round(i * step), total - 1);
    const ts = data[idx]?.timestamp;
    if (ts != null && (ticks.length === 0 || ticks[ticks.length - 1] !== ts)) {
      ticks.push(ts);
    }
  }
  return ticks;
}

const CustomTooltip = ({ active, payload, label, unitFormatter, seriesConfig, formatTimestamp }) => {
  if (active && payload && payload.length) {
    const timestampStr = formatTimestamp ? formatTimestamp(label, true) : `${label}`;
    return (
      <div className="neo-tooltip font-mono">
        <div className="tooltip-time">{timestampStr}</div>
        <div className="tooltip-divider" />
        {payload.map((entry, idx) => {
          const config = seriesConfig?.[entry.dataKey] || {};
          const labelName = config.label || entry.name || entry.dataKey;
          const formattedVal = unitFormatter
            ? unitFormatter(entry.value)
            : `${Number(entry.value).toFixed(1)}`;

          return (
            <div key={idx} className="tooltip-row">
              <span
                className="tooltip-dot"
                style={{ backgroundColor: entry.color || entry.stroke }}
              />
              <span className="tooltip-name">{labelName.toUpperCase()}:</span>
              <span className="tooltip-val">{formattedVal}</span>
            </div>
          );
        })}

        <style>{`
          .neo-tooltip {
            background-color: var(--bg-surface-raised);
            border: 1px solid var(--border-strong);
            padding: 8px 12px;
            font-size: 11px;
            box-shadow: var(--shadow-raised-md);
            border-left: 3px solid var(--accent);
            border-radius: var(--radius-md);
          }
          .tooltip-time {
            color: var(--text-secondary);
            font-size: 10px;
            margin-bottom: 4px;
            letter-spacing: 0.04em;
          }
          .tooltip-divider {
            height: 1px;
            background: var(--border-subtle);
            margin-bottom: 6px;
          }
          .tooltip-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 3px;
          }
          .tooltip-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
          }
          .tooltip-name {
            color: var(--text-tertiary);
            font-size: 10px;
          }
          .tooltip-val {
            color: var(--text-primary);
            font-weight: 700;
            margin-left: auto;
          }
        `}</style>
      </div>
    );
  }
  return null;
};

export function TelemetryChart({
  data = [],
  series = [
    { key: 'value', label: 'Value', color: '#16a34a', fillOpacity: 0.15 }
  ],
  unitFormatter,
  yDomain = [0, 'auto'],
  chartType = 'area', // 'area' or 'line'
  loading = false,
}) {
  const { formatChartTime, formatTimestamp } = useTimezone();

  // Realign timeline so latest point matches real-time now for live demo
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const lastItem = data[data.length - 1];
    if (!lastItem || lastItem.timestamp == null) return data;

    const nowSec = Math.floor(Date.now() / 1000);
    let rawTs = lastItem.timestamp;
    if (rawTs > 1e11) {
      rawTs = Math.floor(rawTs / 1000);
    }
    const timeShift = nowSec - rawTs;

    return data.map((item) => {
      let itemTs = item.timestamp;
      if (itemTs > 1e11) {
        itemTs = Math.floor(itemTs / 1000);
      }
      return {
        ...item,
        timestamp: itemTs + timeShift,
      };
    });
  }, [data]);

  const adaptiveTicks = useMemo(() => getAdaptiveTicks(chartData, 7), [chartData]);

  // If loading and no prior data exists at all
  if (loading && (!data || data.length === 0)) {
    return (
      <div className="chart-loading-skeleton font-mono">
        <span>FETCHING TELEMETRY HISTORY...</span>
        <style>{`
          .chart-loading-skeleton {
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-tertiary);
            font-size: 10px;
            border-radius: var(--radius-md);
          }
        `}</style>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="chart-empty font-mono">
        <span>NO HISTORICAL TELEMETRY DATA AVAILABLE IN WINDOW</span>
        <style>{`
          .chart-empty {
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-tertiary);
            font-size: 11px;
            border: 1px dashed var(--border-subtle);
            border-radius: var(--radius-md);
          }
        `}</style>
      </div>
    );
  }

  const seriesMap = {};
  series.forEach((s) => {
    seriesMap[s.key] = s;
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chartType === 'area' ? (
        <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 15, bottom: 4 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={s.fillOpacity ?? 0.18} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0.0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="timestamp"
            ticks={adaptiveTicks}
            tickFormatter={formatChartTime}
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--text-tertiary)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border-subtle)' }}
            interval={0}
            minTickGap={35}
            padding={{ left: 10, right: 10 }}
          />
          <YAxis
            domain={yDomain}
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--text-tertiary)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            width={54}
            dx={-2}
            tickFormatter={(val) => (unitFormatter ? unitFormatter(val) : val)}
          />
          <Tooltip
            content={<CustomTooltip unitFormatter={unitFormatter} seriesConfig={seriesMap} formatTimestamp={formatTimestamp} />}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={1.8}
              fill={`url(#grad-${s.key})`}
              isAnimationActive={true}
              animationDuration={400}
              animationEasing="ease-in-out"
            />
          ))}
        </AreaChart>
      ) : (
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 15, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="timestamp"
            ticks={adaptiveTicks}
            tickFormatter={formatChartTime}
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--text-tertiary)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border-subtle)' }}
            interval={0}
            minTickGap={35}
            padding={{ left: 10, right: 10 }}
          />
          <YAxis
            domain={yDomain}
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--text-tertiary)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            width={54}
            dx={-2}
            tickFormatter={(val) => (unitFormatter ? unitFormatter(val) : val)}
          />
          <Tooltip
            content={<CustomTooltip unitFormatter={unitFormatter} seriesConfig={seriesMap} formatTimestamp={formatTimestamp} />}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={true}
              animationDuration={400}
              animationEasing="ease-in-out"
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

export default TelemetryChart;
