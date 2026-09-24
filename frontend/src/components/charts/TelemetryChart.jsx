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
    const timestampStr = formatTimestamp ? formatTimestamp(label, true, false) : `${label}`;
    return (
      <div className="nokia-chart-tooltip font-sans">
        <div className="tooltip-time font-sans">{timestampStr}</div>
        <div className="tooltip-hsep" />
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
              <span className="tooltip-name">{labelName}:</span>
              <span className="tooltip-val font-sans">{formattedVal}</span>
            </div>
          );
        })}

        <style>{`
          .nokia-chart-tooltip {
            background-color: var(--bg-surface);
            border: 1px solid var(--border-subtle);
            padding: 8px 12px;
            font-size: 12px;
            border-radius: var(--radius-sm);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          }
          .tooltip-time {
            color: var(--text-muted);
            font-size: 11px;
            margin-bottom: 4px;
          }
          .tooltip-hsep {
            height: 1px;
            background-color: var(--border-subtle);
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
            color: var(--text-secondary);
            font-size: 12px;
          }
          .tooltip-val {
            color: var(--text-primary);
            font-weight: 500;
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
    { key: 'value', label: 'Value', color: 'var(--text-primary)', fillOpacity: 0.05 }
  ],
  unitFormatter,
  yDomain = [0, 'auto'],
  chartType = 'area',
  loading = false,
}) {
  const { formatChartTime, formatTimestamp } = useTimezone();

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data;
  }, [data]);

  const xTicks = useMemo(() => getAdaptiveTicks(chartData, 6), [chartData]);

  const seriesConfigMap = useMemo(() => {
    const map = {};
    series.forEach((s) => {
      map[s.key] = s;
    });
    return map;
  }, [series]);

  if (loading) {
    return (
      <div className="chart-loading-box font-sans text-muted text-xs">
        Loading telemetry stream...
        <style>{`
          .chart-loading-box {
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
        `}</style>
      </div>
    );
  }

  if (!chartData || chartData.length === 0) {
    return (
      <div className="chart-empty-box font-sans text-muted text-xs">
        No telemetry data available
        <style>{`
          .chart-empty-box {
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
        `}</style>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chartType === 'line' ? (
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          <XAxis
            dataKey="timestamp"
            ticks={xTicks}
            tickFormatter={(val) => formatChartTime(val)}
            stroke="var(--text-muted)"
            fontSize={11}
            fontFamily="var(--font-sans)"
            tickLine={false}
            axisLine={{ stroke: 'var(--border-subtle)' }}
          />
          <YAxis
            domain={yDomain}
            stroke="var(--text-muted)"
            fontSize={11}
            fontFamily="var(--font-sans)"
            tickLine={false}
            axisLine={{ stroke: 'var(--border-subtle)' }}
            tickFormatter={(val) => (unitFormatter ? unitFormatter(val) : val)}
          />
          <Tooltip
            content={
              <CustomTooltip
                unitFormatter={unitFormatter}
                seriesConfig={seriesConfigMap}
                formatTimestamp={formatTimestamp}
              />
            }
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color || 'var(--text-primary)'}
              strokeWidth={s.strokeWidth || 1.5}
              strokeDasharray={s.strokeDasharray}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          ))}
        </LineChart>
      ) : (
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={`grad-${s.key}`} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color || 'var(--text-primary)'} stopOpacity={s.fillOpacity ?? 0.08} />
                <stop offset="95%" stopColor={s.color || 'var(--text-primary)'} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          <XAxis
            dataKey="timestamp"
            ticks={xTicks}
            tickFormatter={(val) => formatChartTime(val)}
            stroke="var(--text-muted)"
            fontSize={11}
            fontFamily="var(--font-sans)"
            tickLine={false}
            axisLine={{ stroke: 'var(--border-subtle)' }}
          />
          <YAxis
            domain={yDomain}
            stroke="var(--text-muted)"
            fontSize={11}
            fontFamily="var(--font-sans)"
            tickLine={false}
            axisLine={{ stroke: 'var(--border-subtle)' }}
            tickFormatter={(val) => (unitFormatter ? unitFormatter(val) : val)}
          />
          <Tooltip
            content={
              <CustomTooltip
                unitFormatter={unitFormatter}
                seriesConfig={seriesConfigMap}
                formatTimestamp={formatTimestamp}
              />
            }
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color || 'var(--text-primary)'}
              strokeWidth={s.strokeWidth || 1.5}
              strokeDasharray={s.strokeDasharray}
              fill={`url(#grad-${s.key})`}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          ))}
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}

export default TelemetryChart;
