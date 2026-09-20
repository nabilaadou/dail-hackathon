import type { CsvParseResponse } from './case-parser';

import { useState, useEffect, useCallback } from 'react';

type JobStatus = {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  total_rows: number;
  selected_rows: number;
  completed_rows: number;
  error_count: number;
  message?: string;
};

class JobRequestError extends Error {
  constructor(
    message: string,
    public terminal: boolean
  ) {
    super(message);
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new JobRequestError(
      typeof body.detail === 'string'
        ? body.detail
        : (body.error ?? `The parser request failed (HTTP ${response.status}).`),
      response.status >= 400 && response.status < 500 && response.status !== 429
    );
  }
  return body as T;
}

function rememberJob(key: string | null, id: string | null) {
  if (!key) return;
  try {
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
  } catch {
    // Storage can be disabled; processing still works for this page session.
  }
}

export function useCsvJob(storageKey: string | null) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<JobStatus | null>(null);
  const [completedBatch, setCompletedBatch] = useState<CsvParseResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) setJobId(stored);
    } catch {
      // Resume is optional when browser storage is unavailable.
    }
  }, [storageKey]);

  useEffect(() => {
    if (!jobId || paused) return undefined;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;

    const poll = async () => {
      try {
        const status = await readResponse<JobStatus>(
          await fetch(`/api/csv-jobs/${jobId}`, {
            cache: 'no-store',
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
          })
        );
        if (controller.signal.aborted) return;
        setProgress(status);
        if (status.status === 'failed') {
          throw new JobRequestError(status.message ?? 'Analysis failed. Please try again.', true);
        }
        if (status.status === 'completed') {
          const batch = await readResponse<CsvParseResponse>(
            await fetch(`/api/csv-jobs/${jobId}?result=true`, {
              cache: 'no-store',
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
            })
          );
          if (controller.signal.aborted) return;
          if (!batch.results.length) {
            throw new JobRequestError(
              `No rows could be processed. ${batch.errors[0]?.message ?? 'Check the CSV contents.'}`,
              true
            );
          }
          setCompletedBatch(batch);
          rememberJob(storageKey, null);
          setJobId(null);
          setError(null);
          return;
        }
        failures = 0;
        setError(null);
        timer = setTimeout(poll, 1500);
      } catch (cause) {
        if (controller.signal.aborted) return;
        const message =
          cause instanceof Error ? cause.message : 'Unable to check analysis progress.';
        if (cause instanceof JobRequestError && cause.terminal) {
          setError(message);
          rememberJob(storageKey, null);
          setJobId(null);
          return;
        }
        failures += 1;
        setError('Connection interrupted. Your analysis may still be running; reconnecting…');
        if (failures >= 5) {
          setError('Unable to check progress. Retry the connection to continue this analysis.');
          setPaused(true);
          return;
        }
        timer = setTimeout(poll, Math.min(1000 * 2 ** failures, 10000));
      }
    };

    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [jobId, paused, storageKey]);

  const start = useCallback(
    async (file: File, limit: number | null) => {
      setUploading(true);
      setError(null);
      setProgress(null);
      setCompletedBatch(null);
      setPaused(false);
      try {
        const query = limit === null ? '' : `?limit=${limit}`;
        const status = await readResponse<JobStatus>(
          await fetch(`/api/csv-jobs${query}`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/csv; charset=utf-8' },
            body: file,
          })
        );
        rememberJob(storageKey, status.job_id);
        setProgress(status);
        setJobId(status.job_id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to start analysis.');
      } finally {
        setUploading(false);
      }
    },
    [storageKey]
  );

  return {
    start,
    progress,
    completedBatch,
    error,
    isSubmitting: uploading || Boolean(jobId),
    canRetry: paused,
    retry: () => {
      setError(null);
      setPaused(false);
    },
  };
}
