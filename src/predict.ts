import type { ToolOptions } from './types';
import type { PredictInput } from './predict-input.generated';
export type { PredictInput } from './predict-input.generated';

/** Transport options are accepted; receipt metadata is not supported. */
export type PredictOptions = PredictInput & Omit<ToolOptions, 'memo' | 'valueTag' | 'decisionContext'>;
export type PredictModel = PredictInput['model'];

/** Durable job handle returned when Predict is submitted with wait: false. */
export type PredictPendingResult = {
  status: 'pending' | 'processing';
  request_id: string;
  receipt_id?: string;
  idempotencyKey: string;
};

type PredictMeta<M extends PredictModel> = {
  model: M;
  version: string;
  size: number;
  size_band: 'small' | 'medium' | 'large';
  time_limit_s: number;
  run_time_s: number;
};
type PredictBase<M extends PredictModel> = {
  model: M;
  version: string;
  status: 'complete' | 'timeout';
  checks: Array<{ name: string; passed: boolean; detail: string }>;
};

export type PredictSimulationResult = PredictBase<'simulation'> & {
  prediction: { outputs: Array<{ id: string; mean: number; median: number }> } | null;
  uncertainty: { outputs: Array<{
    id: string; sd: number; mean_standard_error: number; min: number; max: number;
    percentiles: Array<{ p: number; value: number }>;
  }> } | null;
  meta: PredictMeta<'simulation'> & {
    seed: number; runs_requested: number; runs_completed: number; runs_discarded: number; runs_kept: number;
  };
};

export type PredictForecastResult = PredictBase<'forecast'> & {
  prediction: { points: Array<{ t: string | number; value: number }> };
  uncertainty: { intervals: Array<{ level: number; points: Array<{ t: string | number; lower: number; upper: number }> }> };
  meta: PredictMeta<'forecast'> & {
    method: string; series_length: number; gaps_filled: number;
    frequency: NonNullable<Extract<PredictInput, { model: 'forecast' }>['forecast']['frequency']> | null;
    seasonal_period: number | null; horizon: number; candidates_tried: number;
    backtest: { holdout_points: number; mae: number; rmse: number };
  };
};

export type PredictResultFor<M extends PredictModel> = M extends 'simulation' ? PredictSimulationResult : PredictForecastResult;
export type PredictResult = PredictResultFor<PredictModel>;
