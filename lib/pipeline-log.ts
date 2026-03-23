import { getSupabaseServerClient } from './db';

export interface PipelineStepError {
  symbol?: string;
  message: string;
}

export interface PipelineStepLog {
  step: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'error' | 'skipped';
  stats: Record<string, number>;
  errors: PipelineStepError[];
}

export interface PipelineRun {
  run_id: string;
  source: 'cron' | 'script' | 'manual';
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'error';
  steps: PipelineStepLog[];
  error_count: number;
}

function generateRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}_${random}`;
}

export function createPipelineRun(source: PipelineRun['source']): PipelineRun {
  return {
    run_id: generateRunId(),
    source,
    started_at: new Date().toISOString(),
    finished_at: null,
    status: 'running',
    steps: [],
    error_count: 0,
  };
}

export function startStep(run: PipelineRun, stepName: string): PipelineStepLog {
  const step: PipelineStepLog = {
    step: stepName,
    started_at: new Date().toISOString(),
    finished_at: null,
    status: 'running',
    stats: {},
    errors: [],
  };
  run.steps.push(step);
  return step;
}

function findStep(run: PipelineRun, stepName: string): PipelineStepLog | undefined {
  return run.steps.find((s) => s.step === stepName);
}

export function finishStep(
  run: PipelineRun,
  stepName: string,
  status: 'success' | 'error' | 'skipped',
  stats?: Record<string, number>,
): void {
  const step = findStep(run, stepName);
  if (!step) return;

  step.finished_at = new Date().toISOString();
  step.status = status;
  if (stats) step.stats = { ...step.stats, ...stats };
  if (status === 'error') run.error_count += step.errors.length || 1;
}

export function logStepError(
  run: PipelineRun,
  stepName: string,
  symbol: string | undefined,
  message: string,
): void {
  const step = findStep(run, stepName);
  if (!step) return;
  step.errors.push({ symbol, message });
}

export function finishRun(run: PipelineRun): void {
  run.finished_at = new Date().toISOString();
  run.error_count = run.steps.reduce((sum, s) => sum + s.errors.length, 0);
  run.status = run.steps.some((s) => s.status === 'error') ? 'error' : 'success';
}

export async function savePipelineRun(run: PipelineRun): Promise<void> {
  const db = getSupabaseServerClient();
  const { error } = await db.from('pipeline_runs').upsert({
    run_id: run.run_id,
    source: run.source,
    started_at: run.started_at,
    finished_at: run.finished_at,
    status: run.status,
    steps: run.steps,
    error_count: run.error_count,
  }, { onConflict: 'run_id' });

  if (error) {
    throw new Error(`Failed to save pipeline run: ${error.message}`);
  }
}

export function printPipelineRun(run: PipelineRun): void {
  const elapsed = run.finished_at
    ? ((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000).toFixed(1)
    : '?';

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Pipeline Run: ${run.run_id}`);
  console.log(`Source: ${run.source} | Status: ${run.status} | Elapsed: ${elapsed}s`);
  console.log(`${'='.repeat(50)}`);

  for (const step of run.steps) {
    const stepElapsed = step.finished_at
      ? ((new Date(step.finished_at).getTime() - new Date(step.started_at).getTime()) / 1000).toFixed(1)
      : '?';
    const statsStr = Object.entries(step.stats).map(([k, v]) => `${k}=${v}`).join(', ');
    const icon = step.status === 'success' ? '+' : step.status === 'error' ? 'x' : step.status === 'skipped' ? '-' : '~';
    console.log(`  [${icon}] ${step.step} (${stepElapsed}s) ${statsStr}`);

    if (step.errors.length > 0) {
      const shown = step.errors.slice(0, 5);
      for (const err of shown) {
        console.log(`      ERR: ${err.symbol ? `${err.symbol}: ` : ''}${err.message}`);
      }
      if (step.errors.length > 5) {
        console.log(`      ... and ${step.errors.length - 5} more errors`);
      }
    }
  }

  console.log(`\nTotal errors: ${run.error_count}`);
  console.log(`${'='.repeat(50)}\n`);
}
