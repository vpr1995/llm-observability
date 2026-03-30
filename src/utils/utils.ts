const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

export const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

export const delayWithAbort = (delayMs: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      reject(abortError);
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);

    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      reject(abortError);
    };

    signal?.addEventListener('abort', onAbort);
  });

export const getRetryDelay = (attempt: number): number => {
  const exponentialDelay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1));
  const jitterMs = Math.floor(Math.random() * 250);
  return Math.min(MAX_DELAY_MS, exponentialDelay + jitterMs);
};
