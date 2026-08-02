import React from 'react';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import { TrendingUp } from 'lucide-react';

export function ForecastsPage() {
  return (
    <div className="forecasts-page">
      <PageHeader
        index="03"
        title="CAPACITY FORECASTS"
        subtitle="Multi-step predictive modeling for CPU, Memory, and Storage saturation risks."
        tag="PREDICTIVE INTELLIGENCE"
      />

      <EmptyState
        title="NO FORECAST MODEL CONNECTED"
        subtitle="The PatchTST / Chronos neural forecasting model service is not currently returning predictions."
        statusTag="MODEL PIPELINE UNCONNECTED"
        icon={TrendingUp}
        technicalNotes={[
          'Model Architecture: PatchTST / Chronos Transformer for long-horizon time series forecasting',
          'Forecast Horizons: +1h, +6h, +24h multi-step prediction windows',
          'Confidence Interval: 90% and 95% quantile uncertainty bounds',
          'Training Pipeline: Continuous online model retraining against VictoriaMetrics historical store',
        ]}
      />
    </div>
  );
}

export default ForecastsPage;
