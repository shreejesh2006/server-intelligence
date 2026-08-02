import React from 'react';
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
import { formatChartTime, formatUtcTime } from '../../utils/formatters';

const CustomTooltip = ({ active, payload, label, unitFormatter, seriesConfig }) => {
  if (active && payload && payload.length) {
    const timestampStr = formatUtcTime(label);
    return (
      <div className="editorial-tooltip font-mono">
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
          .editorial-tooltip {
            background-color: var(--chart-tooltip-bg);
            border: 1px solid var(--chart-tooltip-border);
            padding: 8px 12px;
            font-size: 11px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }
          .tooltip-time {
            color: var(--text-secondary);
            font-size: 10px;
            margin-bottom: 4px;
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
            font-weight: 600;
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
    { key: 'value', label: 'Value', color: '#f97316', fillOpacity: 0.15 }
  ],
  unitFormatter,
  yDomain = [0, 'auto'],
  chartType = 'area', // 'area' or 'line'
}) {
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
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={s.fillOpacity ?? 0.2} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0.0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatChartTime}
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--chart-tick)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
          />
          <YAxis
            domain={yDomain}
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--chart-tick)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            tickFormatter={(val) => (unitFormatter ? unitFormatter(val) : val)}
          />
          <Tooltip
            content={<CustomTooltip unitFormatter={unitFormatter} seriesConfig={seriesMap} />}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={1.5}
              fill={`url(#grad-${s.key})`}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      ) : (
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatChartTime}
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--chart-tick)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
          />
          <YAxis
            domain={yDomain}
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--chart-tick)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            tickFormatter={(val) => (unitFormatter ? unitFormatter(val) : val)}
          />
          <Tooltip
            content={<CustomTooltip unitFormatter={unitFormatter} seriesConfig={seriesMap} />}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

export default TelemetryChart;
